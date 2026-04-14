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
			// Inner commands from $(...) are tagged "substitution"
			walk(child, out, nested, "substitution");
		} else if (child.type === "string" || child.type === "command_name") {
			// command_substitution may appear inside a string or command_name node
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
		if (op && tgt) redirects.push({ op, target: decodeNode(tgt) });
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
			// For concatenations, inspect children to determine kind.
			// If any child is a variable/substitution the whole token is considered
			// its most derived kind; otherwise literal.
			let kind: ArgvKind = "literal";
			const parts: string[] = [];
			for (const sub of child.namedChildren) {
				if (sub) {
					const subKind = nodeTypeToArgvKind(sub.type);
					if (subKind === "substitution") kind = "substitution";
					else if (subKind === "variable" && kind === "literal") kind = "variable";
					parts.push(decodeNode(sub));
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
			type === "ansi_c_string" ||
			type === "number" ||
			type === "simple_expansion" ||
			type === "expansion" ||
			type === "command_substitution"
		) {
			argv.push(decodeNode(child));
			// For command_name, derive the kind from the inner child's type so that
			// `$X` and `$(...)` at argv0 are tagged correctly (not as "literal").
			const kindType = type === "command_name" ? (child.namedChild(0)?.type ?? type) : type;
			argvKinds.push(nodeTypeToArgvKind(kindType));
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

	// C1: eval re-parse — if argv0 is "eval" and all args are literals,
	// concatenate argv[1..] and queue for re-parse with source "eval".
	// If any arg is variable or substitution, the payload is opaque — skip.
	if (argv0Basename === "eval" && argv.length > 1) {
		const allLiteral = argvKinds.slice(1).every((k) => k === "literal");
		if (allLiteral) {
			nested.push({ source: "eval", payload: argv.slice(1).join(" ") });
		}
	}

	return { argv, argvKinds, argv0Basename, redirects, source, raw: node.text };
}

/**
 * Decode a single tree-sitter argument node into its literal string value.
 *
 * Dispatches on node.type:
 *   word          — process backslash escapes (\X → X)
 *   raw_string    — strip outer '...' quotes, everything inside is literal
 *   string        — strip outer "..." quotes, process \\, \", \$, \`; join
 *                   literal string_content children (substitution children
 *                   are skipped for literal value — they are opaque here)
 *   ansi_c_string — strip outer $'...' wrapper, process ANSI-C escapes
 *   concatenation — recurse into children, join with empty string
 *   number        — text as-is
 *   command_name  — text as-is
 *   anything else — text as-is
 */
function decodeNode(node: Parser.SyntaxNode): string {
	switch (node.type) {
		case "word": {
			// Process backslash escapes in unquoted words: \X → X
			return processWordEscapes(node.text);
		}
		case "raw_string": {
			// Single-quoted: strip outer '...', no escape processing inside
			const t = node.text;
			if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
				return t.slice(1, -1);
			}
			return t;
		}
		case "string": {
			// Double-quoted: walk named children, collect string_content literally
			// and skip substitution/expansion children (they're dynamic).
			// Process double-quote escapes in string_content.
			const parts: string[] = [];
			for (const child of node.children) {
				if (!child) continue;
				if (child.type === "string_content") {
					parts.push(processDoubleQuoteEscapes(child.text));
				}
				// command_substitution, simple_expansion, expansion → skip (not literal)
			}
			return parts.join("");
		}
		case "ansi_c_string": {
			// $'...' ANSI-C quoted string
			const t = node.text;
			// Strip $' prefix and ' suffix
			if (t.startsWith("$'") && t.endsWith("'") && t.length >= 3) {
				return processAnsiCEscapes(t.slice(2, -1));
			}
			return t;
		}
		case "concatenation": {
			// Recurse into each named child and join
			return node.namedChildren.map((c) => (c ? decodeNode(c) : "")).join("");
		}
		case "command_name": {
			// command_name wraps the actual token node (word, raw_string, string,
			// ansi_c_string, simple_expansion, command_substitution, concatenation, …).
			// Delegate to that child for proper decoding; fall back to raw text.
			const child = node.namedChild(0);
			if (child) return decodeNode(child);
			return node.text;
		}
		default:
			return node.text;
	}
}

/** Process backslash escapes in unquoted words: \X → X for any X. */
function processWordEscapes(s: string): string {
	return s.replace(/\\(.)/g, "$1");
}

/** Process escape sequences valid inside double-quoted strings. */
function processDoubleQuoteEscapes(s: string): string {
	// Inside double-quotes: \\ → \, \" → ", \$ → $, \` → `
	// Other backslash sequences are kept as-is (backslash preserved).
	return s.replace(/\\([\\"`$])/g, "$1");
}

/** Process ANSI-C escape sequences from within $'...'. */
function processAnsiCEscapes(s: string): string {
	let result = "";
	let i = 0;
	while (i < s.length) {
		if (s[i] !== "\\" || i + 1 >= s.length) {
			result += s[i];
			i++;
			continue;
		}
		const next = s[i + 1] as string;
		switch (next) {
			case "\\":
				result += "\\";
				i += 2;
				break;
			case "n":
				result += "\n";
				i += 2;
				break;
			case "t":
				result += "\t";
				i += 2;
				break;
			case "r":
				result += "\r";
				i += 2;
				break;
			case "v":
				result += "\v";
				i += 2;
				break;
			case "b":
				result += "\b";
				i += 2;
				break;
			case "a":
				result += "\x07";
				i += 2;
				break;
			case "e":
			case "E":
				result += "\x1b";
				i += 2;
				break;
			case "'":
				result += "'";
				i += 2;
				break;
			case '"':
				result += '"';
				i += 2;
				break;
			case "x": {
				// \xHH — 1-2 hex digits
				const hex = s.slice(i + 2, i + 4).match(/^[0-9a-fA-F]{1,2}/)?.[0] ?? "";
				if (hex) {
					result += String.fromCharCode(Number.parseInt(hex, 16));
					i += 2 + hex.length;
				} else {
					result += "\\x";
					i += 2;
				}
				break;
			}
			case "u": {
				// \uHHHH — exactly 4 hex digits
				const hex = s.slice(i + 2, i + 6).match(/^[0-9a-fA-F]{4}/)?.[0] ?? "";
				if (hex) {
					result += String.fromCharCode(Number.parseInt(hex, 16));
					i += 2 + hex.length;
				} else {
					result += "\\u";
					i += 2;
				}
				break;
			}
			case "U": {
				// \UHHHHHHHH — exactly 8 hex digits
				const hex = s.slice(i + 2, i + 10).match(/^[0-9a-fA-F]{8}/)?.[0] ?? "";
				if (hex) {
					result += String.fromCodePoint(Number.parseInt(hex, 16));
					i += 2 + hex.length;
				} else {
					result += "\\U";
					i += 2;
				}
				break;
			}
			default: {
				// \NNN — 1-3 octal digits
				const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? "";
				if (oct) {
					result += String.fromCharCode(Number.parseInt(oct, 8));
					i += 1 + oct.length;
				} else {
					result += `\\${next}`;
					i += 2;
				}
				break;
			}
		}
	}
	return result;
}
