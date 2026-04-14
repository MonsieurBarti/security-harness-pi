import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import type { ArgvKind, BashAnalysis, CommandSource, Redirect, SimpleCommand } from "../types.js";

const WASM_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"wasm",
	"tree-sitter-bash.wasm",
);

/**
 * BashAnalyzer parses bash command strings and extracts SimpleCommand metadata.
 *
 * Concurrency: this class wraps a single web-tree-sitter Parser instance.
 * `analyze()` is synchronous and not re-entrant. In single-threaded Node
 * (the only environment pi runs in), per-call invocations are sequential
 * and safe. Do NOT share an instance across worker threads. `create()`
 * is async only because Parser.init() requires loading WASM.
 */
export class BashAnalyzer {
	private constructor(private parser: Parser) {}

	static async create(): Promise<BashAnalyzer> {
		await Parser.init();
		const parser = new Parser();
		const bytes = readFileSync(WASM_PATH);
		const lang = await Parser.Language.load(bytes);
		parser.setLanguage(lang);
		return new BashAnalyzer(parser);
	}

	analyze(command: string): BashAnalysis {
		const queue: { source: CommandSource; payload: string }[] = [
			{ source: "top", payload: command },
		];
		const out: SimpleCommand[] = [];
		let parseError: string | undefined;

		while (queue.length > 0) {
			const item = queue.shift();
			if (item === undefined) break;
			const tree = this.parser.parse(item.payload);
			if (!tree) {
				parseError = "tree-sitter returned null";
				continue;
			}
			const root = tree.rootNode;
			if (root.hasError) {
				parseError = parseError ?? "syntax error in command";
				continue;
			}
			const nested: { source: CommandSource; payload: string }[] = [];
			walk(root, out, nested, item.source);
			queue.push(...nested);
		}

		return parseError ? { commands: out, parseError } : { commands: out };
	}
}

/** Recursively find command_substitution nodes within a command node's children and walk them. */
function walkCommandSubstitutions(
	node: Parser.SyntaxNode,
	out: SimpleCommand[],
	nested: { source: CommandSource; payload: string }[],
	source: CommandSource,
): void {
	for (const child of node.children) {
		if (!child) continue;
		if (child.type === "command_substitution") {
			walk(child, out, nested, source);
		} else if (child.type === "string") {
			// command_substitution may appear inside a string node
			walkCommandSubstitutions(child, out, nested, source);
		}
	}
}

function extractRedirectsFromNode(node: Parser.SyntaxNode): Redirect[] {
	const redirects: Redirect[] = [];
	for (const child of node.namedChildren) {
		if (!child || child.type !== "file_redirect") continue;
		const opNode = child.child(0);
		const tgt = child.namedChild(0);
		const op = opNode?.text as Redirect["op"] | undefined;
		if (op && tgt) redirects.push({ op, target: unquote(tgt.text) });
	}
	return redirects;
}

function walk(
	node: Parser.SyntaxNode,
	out: SimpleCommand[],
	nested: { source: CommandSource; payload: string }[],
	source: CommandSource,
): void {
	if (node.type === "redirected_statement") {
		// Find the inner command child and collect file_redirect siblings.
		const outerRedirects = extractRedirectsFromNode(node);
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const sc = extractSimpleCommand(child, nested, source);
				if (sc) {
					sc.redirects.push(...outerRedirects);
					out.push(sc);
				}
				walkCommandSubstitutions(child, out, nested, source);
			} else if (child.type !== "file_redirect") {
				walk(child, out, nested, source);
			}
		}
		return;
	}
	if (node.type === "pipeline") {
		const pipeCmds: SimpleCommand[] = [];
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const sc = extractSimpleCommand(child, nested, source);
				if (sc) {
					out.push(sc);
					pipeCmds.push(sc);
				}
				walkCommandSubstitutions(child, out, nested, source);
			} else {
				walk(child, out, nested, source);
			}
		}
		let prev: SimpleCommand | undefined;
		for (const cmd of pipeCmds) {
			if (prev) {
				prev.pipeNext = cmd;
				cmd.pipePrev = prev;
			}
			prev = cmd;
		}
		return;
	}
	if (node.type === "command") {
		const sc = extractSimpleCommand(node, nested, source);
		if (sc) out.push(sc);
		// Also descend into command_substitution nodes within this command's args.
		walkCommandSubstitutions(node, out, nested, source);
		return;
	}
	if (node.type === "command_substitution") {
		// Descend directly into command_substitution so inner commands are extracted.
		for (const child of node.namedChildren) {
			if (child) walk(child, out, nested, source);
		}
		return;
	}
	for (const child of node.namedChildren) {
		if (child) walk(child, out, nested, source);
	}
}

const SHELL_COMMANDS = new Set(["bash", "sh", "zsh", "dash"]);

/**
 * Maps a tree-sitter node type to an ArgvKind.
 *
 * Mapping used:
 *   - "simple_expansion" ($X)  → "variable"
 *   - "expansion" (${FOO})     → "variable"
 *   - "command_substitution"   → "substitution"
 *   - everything else (word, string, raw_string, concatenation,
 *     number, ansi_c_string, command_name) → "literal"
 */
function nodeTypeToArgvKind(nodeType: string): ArgvKind {
	if (nodeType === "simple_expansion" || nodeType === "expansion") {
		return "variable";
	}
	if (nodeType === "command_substitution") {
		return "substitution";
	}
	return "literal";
}

function computeArgv0Basename(argv0: string, kind: ArgvKind): string {
	if (kind === "literal" && argv0.includes("/")) {
		const idx = argv0.lastIndexOf("/");
		return argv0.slice(idx + 1);
	}
	return argv0;
}

function extractSimpleCommand(
	node: Parser.SyntaxNode,
	nested: { source: CommandSource; payload: string }[],
	source: CommandSource,
): SimpleCommand | null {
	const argv: string[] = [];
	const argvKinds: ArgvKind[] = [];
	const redirects: Redirect[] = [];

	for (const child of node.namedChildren) {
		const type = child.type;
		if (type === "concatenation") {
			// For concatenations, inspect the first named child to determine kind.
			// If any child is a variable/substitution the whole token is considered
			// its most derived kind; otherwise literal.
			let kind: ArgvKind = "literal";
			const parts: string[] = [];
			for (const sub of child.namedChildren) {
				if (sub) {
					const subKind = nodeTypeToArgvKind(sub.type);
					if (subKind === "substitution") kind = "substitution";
					else if (subKind === "variable" && kind === "literal") kind = "variable";
					parts.push(unquote(sub.text));
				}
			}
			argv.push(parts.join(""));
			argvKinds.push(kind);
			continue;
		}
		if (
			type === "command_name" ||
			type === "word" ||
			type === "string" ||
			type === "raw_string" ||
			type === "number" ||
			type === "simple_expansion" ||
			type === "expansion" ||
			type === "command_substitution"
		) {
			argv.push(unquote(child.text));
			argvKinds.push(nodeTypeToArgvKind(type));
		}
	}
	if (argv.length === 0) return null;

	const argv0 = argv[0] ?? "";
	const argv0Kind = argvKinds[0] ?? "literal";
	const argv0Basename = computeArgv0Basename(argv0, argv0Kind);

	// Detect shell -c <payload> and queue payload for re-parsing.
	if (SHELL_COMMANDS.has(argv0) && argv.includes("-c")) {
		const cIdx = argv.indexOf("-c");
		const payload = argv[cIdx + 1];
		if (payload !== undefined) {
			nested.push({ source: "shell-c", payload });
		}
	}

	return { argv, argvKinds, argv0Basename, redirects, source, raw: node.text };
}

function unquote(s: string): string {
	if (s.length >= 2 && (s.startsWith("'") || s.startsWith('"'))) {
		const q = s[0] as string;
		if (s.endsWith(q)) return s.slice(1, -1);
	}
	return s;
}
