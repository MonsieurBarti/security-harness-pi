import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import type { BashAnalysis, Redirect, SimpleCommand } from "../types.js";

const WASM_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"wasm",
	"tree-sitter-bash.wasm",
);

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
		const queue: string[] = [command];
		const out: SimpleCommand[] = [];
		let parseError: string | undefined;

		while (queue.length > 0) {
			const src = queue.shift();
			if (src === undefined) break;
			const tree = this.parser.parse(src);
			if (!tree) {
				parseError = "tree-sitter returned null";
				continue;
			}
			const root = tree.rootNode;
			if (root.hasError) {
				parseError = parseError ?? "syntax error in command";
				continue;
			}
			const nested: string[] = [];
			walk(root, out, nested);
			queue.push(...nested);
		}

		return parseError ? { commands: out, parseError } : { commands: out };
	}
}

/** Recursively find command_substitution nodes within a command node's children and walk them. */
function walkCommandSubstitutions(
	node: Parser.SyntaxNode,
	out: SimpleCommand[],
	nested: string[],
): void {
	for (const child of node.children) {
		if (!child) continue;
		if (child.type === "command_substitution") {
			walk(child, out, nested);
		} else if (child.type === "string") {
			// command_substitution may appear inside a string node
			walkCommandSubstitutions(child, out, nested);
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

function walk(node: Parser.SyntaxNode, out: SimpleCommand[], nested: string[]): void {
	if (node.type === "redirected_statement") {
		// Find the inner command child and collect file_redirect siblings.
		const outerRedirects = extractRedirectsFromNode(node);
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const sc = extractSimpleCommand(child, nested);
				if (sc) {
					sc.redirects.push(...outerRedirects);
					out.push(sc);
				}
				walkCommandSubstitutions(child, out, nested);
			} else if (child.type !== "file_redirect") {
				walk(child, out, nested);
			}
		}
		return;
	}
	if (node.type === "pipeline") {
		const pipeCmds: SimpleCommand[] = [];
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const sc = extractSimpleCommand(child, nested);
				if (sc) {
					out.push(sc);
					pipeCmds.push(sc);
				}
				walkCommandSubstitutions(child, out, nested);
			} else {
				walk(child, out, nested);
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
		const sc = extractSimpleCommand(node, nested);
		if (sc) out.push(sc);
		// Also descend into command_substitution nodes within this command's args.
		walkCommandSubstitutions(node, out, nested);
		return;
	}
	if (node.type === "command_substitution") {
		// Descend directly into command_substitution so inner commands are extracted.
		for (const child of node.namedChildren) {
			if (child) walk(child, out, nested);
		}
		return;
	}
	for (const child of node.namedChildren) {
		if (child) walk(child, out, nested);
	}
}

const SHELL_COMMANDS = new Set(["bash", "sh", "zsh", "dash"]);

function extractSimpleCommand(node: Parser.SyntaxNode, nested: string[]): SimpleCommand | null {
	const argv: string[] = [];
	const redirects: Redirect[] = [];
	for (const child of node.namedChildren) {
		const type = child.type;
		if (type === "concatenation") {
			const parts: string[] = [];
			for (const sub of child.namedChildren) {
				if (sub) parts.push(unquote(sub.text));
			}
			argv.push(parts.join(""));
			continue;
		}
		if (
			type === "command_name" ||
			type === "word" ||
			type === "string" ||
			type === "raw_string" ||
			type === "number"
		) {
			argv.push(unquote(child.text));
		}
	}
	if (argv.length === 0) return null;

	// Detect shell -c <payload> and queue payload for re-parsing.
	if (SHELL_COMMANDS.has(argv[0] ?? "") && argv.includes("-c")) {
		const cIdx = argv.indexOf("-c");
		const payload = argv[cIdx + 1];
		if (payload !== undefined) {
			nested.push(payload);
		}
	}

	return { argv, redirects, raw: node.text };
}

function unquote(s: string): string {
	if (s.length >= 2 && (s.startsWith("'") || s.startsWith('"'))) {
		const q = s[0] as string;
		if (s.endsWith(q)) return s.slice(1, -1);
	}
	return s;
}
