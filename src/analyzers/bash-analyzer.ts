import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import type { ArgvKind, BashAnalysis, CommandSource, Redirect, SimpleCommand } from "../types.js";

const MAX_INPUT_BYTES = 64 * 1024; // 64 KB total input string
const MAX_DEPTH = 16; // max nested re-parse depth
const MAX_COMMANDS = 256; // max total SimpleCommands extracted

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
		if (command.length > MAX_INPUT_BYTES) {
			return { commands: [], parseError: "command exceeds maximum size (64KB)" };
		}

		const queue: { source: CommandSource; payload: string; depth: number }[] = [
			{ source: "top", payload: command, depth: 0 },
		];
		const out: SimpleCommand[] = [];
		const err: { value: string | undefined } = { value: undefined };

		while (queue.length > 0) {
			const item = queue.shift();
			if (item === undefined) break;

			if (item.depth > MAX_DEPTH) {
				err.value = "command nesting depth exceeds maximum (16)";
				continue;
			}

			const tree = this.parser.parse(item.payload);
			if (!tree) {
				err.value = "tree-sitter returned null";
				continue;
			}
			const root = tree.rootNode;
			if (root.hasError) {
				err.value = err.value ?? "syntax error in command";
				continue;
			}
			const nested: { source: CommandSource; payload: string; depth: number }[] = [];
			walk(root, out, nested, item.source, item.depth, err);
			queue.push(...nested);

			if (out.length > MAX_COMMANDS) {
				err.value = "command produced too many sub-commands (>256)";
				out.splice(MAX_COMMANDS);
				break;
			}
		}

		return err.value !== undefined ? { commands: out, parseError: err.value } : { commands: out };
	}
}

/**
 * Recursively find command_substitution and process_substitution nodes within
 * a command node's children and walk them.
 */
function walkCommandSubstitutions(
	node: Parser.SyntaxNode,
	out: SimpleCommand[],
	nested: { source: CommandSource; payload: string; depth: number }[],
	source: CommandSource,
	depth: number,
	err: { value: string | undefined },
): void {
	for (const child of node.children) {
		if (!child) continue;
		if (child.type === "command_substitution") {
			// Inner commands from $(...) are tagged "substitution"; bump depth
			walk(child, out, nested, "substitution", depth + 1, err);
		} else if (child.type === "process_substitution") {
			// Inner commands from <(...) or >(...) are tagged "process-substitution"; bump depth
			walk(child, out, nested, "process-substitution", depth + 1, err);
		} else if (child.type === "string" || child.type === "command_name") {
			// command_substitution may appear inside a string or command_name node
			walkCommandSubstitutions(child, out, nested, source, depth, err);
		}
	}
}

function extractRedirectsFromNode(node: Parser.SyntaxNode): Redirect[] {
	const redirects: Redirect[] = [];
	for (const child of node.namedChildren) {
		if (!child || child.type !== "file_redirect") continue;
		// A file_redirect may have an optional leading file_descriptor (e.g. "2" in "2>&1"),
		// followed by the operator token (not named), followed by an optional target.
		//
		// Shapes:
		//   "> word"       — children: [">", word]
		//   ">> word"      — children: [">>", word]
		//   "2>&1"         — children: [file_descriptor("2"), ">&", number("1")]
		//   ">& word"      — children: [">&", word]
		//   "<& num"       — children: ["<&", number]
		//
		// Strategy: if the first child is a file_descriptor, prepend its text to the
		// operator token and use the remaining named child (after file_descriptor) as target.
		// Otherwise take the first anonymous token as op and first named child as target.

		let op: string | undefined;
		let target: string | undefined;

		const firstChild = child.child(0);
		if (firstChild?.type === "file_descriptor") {
			// fd-dup form: fd + op_token + [target]
			const fdText = firstChild.text;
			// Find the anonymous operator token (first child after file_descriptor)
			const opToken = child.child(1);
			const opText = opToken?.text;
			if (opText) {
				op = fdText + opText; // e.g. "2>&"
			}
			// Target: named children that are not file_descriptor
			const tgt = child.namedChildren.find((c) => c && c.type !== "file_descriptor") ?? undefined;
			target = tgt ? decodeNode(tgt) : "";
		} else {
			// Normal form: op_token + target
			const opToken = firstChild;
			op = opToken?.text;
			const tgt = child.namedChild(0);
			target = tgt ? decodeNode(tgt) : undefined;
		}

		if (op !== undefined && target !== undefined) {
			redirects.push({ op, target });
		}
	}
	return redirects;
}

function walk(
	node: Parser.SyntaxNode,
	out: SimpleCommand[],
	nested: { source: CommandSource; payload: string; depth: number }[],
	source: CommandSource,
	depth: number,
	err: { value: string | undefined },
): void {
	// Guard: if depth exceeds limit, record the error and stop descending.
	if (depth > MAX_DEPTH) {
		err.value = "command nesting depth exceeds maximum (16)";
		return;
	}

	if (node.type === "redirected_statement") {
		// Find the inner command child and collect file_redirect siblings.
		const outerRedirects = extractRedirectsFromNode(node);
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const result = extractSimpleCommand(child, nested, source, depth);
				if (result) {
					result.cmd.redirects.push(...outerRedirects);
					out.push(result.cmd);
					if (result.wrapped) out.push(result.wrapped);
				}
				walkCommandSubstitutions(child, out, nested, source, depth, err);
			} else if (child.type !== "file_redirect") {
				walk(child, out, nested, source, depth, err);
			}
		}
		return;
	}
	if (node.type === "pipeline") {
		const pipeCmds: SimpleCommand[] = [];
		for (const child of node.namedChildren) {
			if (!child) continue;
			if (child.type === "command") {
				const result = extractSimpleCommand(child, nested, source, depth);
				if (result) {
					out.push(result.cmd);
					pipeCmds.push(result.cmd);
					if (result.wrapped) out.push(result.wrapped);
				}
				walkCommandSubstitutions(child, out, nested, source, depth, err);
			} else if (child.type === "redirected_statement") {
				// A redirected_statement inside a pipeline (e.g. "cat foo > out | grep bar")
				// — extract the inner command with its redirects and add it to the pipeline.
				const outerRedirects = extractRedirectsFromNode(child);
				for (const innerChild of child.namedChildren) {
					if (!innerChild) continue;
					if (innerChild.type === "command") {
						const result = extractSimpleCommand(innerChild, nested, source, depth);
						if (result) {
							result.cmd.redirects.push(...outerRedirects);
							out.push(result.cmd);
							pipeCmds.push(result.cmd);
							if (result.wrapped) out.push(result.wrapped);
						}
						walkCommandSubstitutions(innerChild, out, nested, source, depth, err);
					} else if (innerChild.type !== "file_redirect") {
						walk(innerChild, out, nested, source, depth, err);
					}
				}
			} else {
				walk(child, out, nested, source, depth, err);
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
		const result = extractSimpleCommand(node, nested, source, depth);
		if (result) {
			out.push(result.cmd);
			if (result.wrapped) out.push(result.wrapped);
		}
		// Also descend into command_substitution nodes within this command's args.
		walkCommandSubstitutions(node, out, nested, source, depth, err);
		return;
	}
	if (node.type === "command_substitution") {
		// Descend directly into command_substitution; bump depth to track nesting.
		const nextDepth = depth + 1;
		if (nextDepth > MAX_DEPTH) {
			err.value = "command nesting depth exceeds maximum (16)";
			return;
		}
		for (const child of node.namedChildren) {
			if (child) walk(child, out, nested, source, nextDepth, err);
		}
		return;
	}
	if (node.type === "process_substitution") {
		// Descend into <(...) and >(...) process substitutions; bump depth.
		const nextDepth = depth + 1;
		if (nextDepth > MAX_DEPTH) {
			err.value = "command nesting depth exceeds maximum (16)";
			return;
		}
		for (const child of node.namedChildren) {
			if (child) walk(child, out, nested, "process-substitution", nextDepth, err);
		}
		return;
	}
	for (const child of node.namedChildren) {
		if (child) walk(child, out, nested, source, depth, err);
	}
}

const SHELL_COMMANDS = new Set(["bash", "sh", "zsh", "dash"]);

/**
 * Parse short-flag clusters to detect -c in bash/sh/zsh/dash invocations.
 * Handles flag clusters like -lic, -cl, -ic, -ci, etc.
 *
 * Note: bash/sh/zsh/dash do NOT have a long-form --command equivalent for -c,
 * so we only handle single-dash clusters here.
 *
 * Returns the -c payload string if found, or undefined.
 */
function findShellCPayload(argv: string[]): string | undefined {
	for (let i = 1; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		// Only handle single-dash, non-double-dash arguments
		if (!arg.startsWith("-") || arg.startsWith("--")) continue;
		const flags = arg.slice(1); // chars after the leading -
		if (flags.includes("c")) {
			// The -c payload is the next argument
			const payload = argv[i + 1];
			return payload;
		}
	}
	return undefined;
}

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
	if (nodeType === "process_substitution") {
		return "process-substitution";
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
	nested: { source: CommandSource; payload: string; depth: number }[],
	source: CommandSource,
	depth: number,
): { cmd: SimpleCommand; wrapped?: SimpleCommand } | null {
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
			type === "command_substitution" ||
			type === "process_substitution"
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
	// Handles both exact "-c" and short-flag clusters like "-lic", "-cl", "-ic".
	// Note: none of bash/sh/zsh/dash have a long-form --command equivalent for -c.
	if (SHELL_COMMANDS.has(argv0Basename)) {
		const payload = findShellCPayload(argv);
		if (payload !== undefined) {
			nested.push({ source: "shell-c", payload, depth: depth + 1 });
		}
	}

	// C1: eval re-parse — if argv0 is "eval" and all args are literals,
	// concatenate argv[1..] and queue for re-parse with source "eval".
	// If any arg is variable or substitution, the payload is opaque — skip.
	if (argv0Basename === "eval" && argv.length > 1) {
		const allLiteral = argvKinds.slice(1).every((k) => k === "literal");
		if (allLiteral) {
			nested.push({ source: "eval", payload: argv.slice(1).join(" "), depth: depth + 1 });
		}
	}

	const cmd: SimpleCommand = { argv, argvKinds, argv0Basename, redirects, source, raw: node.text };

	// H3: extract wrapped SimpleCommand for transparent wrappers.
	// Only attempt when argv0 is a literal (so we know what wrapper we're dealing with).
	// Wrappers are best-effort — if we can't identify the inner command, we skip.
	let wrapped: SimpleCommand | undefined;
	if (argv0Kind === "literal") {
		const w = extractWrappedCommand(cmd);
		if (w !== null) wrapped = w;
	}

	return wrapped !== undefined ? { cmd, wrapped } : { cmd };
}

/**
 * Transparent wrapper commands whose inner argv should be extracted as a
 * separate SimpleCommand with source="wrapper".
 *
 * Wrappers are best-effort: we get common cases right and skip edge cases.
 * All inner argvKinds are tagged "literal" since we're working from already-
 * decoded argv strings, not from the original tree-sitter nodes.
 */
function extractWrappedCommand(wrapper: SimpleCommand): SimpleCommand | null {
	const inner = unwrapArgv(wrapper.argv0Basename, wrapper.argv);
	if (inner === null || inner.length === 0) return null;

	const innerArgv0 = inner[0] ?? "";
	const innerArgv0Kind: ArgvKind = "literal";
	const innerArgv0Basename = computeArgv0Basename(innerArgv0, innerArgv0Kind);
	const innerArgvKinds: ArgvKind[] = inner.map(() => "literal" as ArgvKind);

	return {
		argv: inner,
		argvKinds: innerArgvKinds,
		argv0Basename: innerArgv0Basename,
		redirects: wrapper.redirects,
		// Pipes apply to the wrapper, not the wrapped form.
		pipeNext: undefined,
		pipePrev: undefined,
		source: "wrapper",
		raw: inner.join(" "),
	};
}

/** ENV_ASSIGN_RE matches VAR=value shell variable assignments. */
const ENV_ASSIGN_RE = /^[A-Z_][A-Za-z0-9_]*=/;

/**
 * Given a wrapper name and its full argv, return the inner command's argv,
 * or null if we can't confidently determine it.
 */
function unwrapArgv(wrapperBasename: string, argv: string[]): string[] | null {
	switch (wrapperBasename) {
		case "env": {
			// env [-i] [VAR=val ...] cmd [args...]
			// Skip -i / --ignore-environment flags and VAR=val assignments.
			// The first remaining element is the inner command.
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-i" || a === "--ignore-environment" || a === "--null" || a === "-0") {
					i++;
				} else if (a.startsWith("-") && !ENV_ASSIGN_RE.test(a)) {
					// Unknown flag — skip it and possibly its value
					i++;
				} else if (ENV_ASSIGN_RE.test(a)) {
					i++;
				} else {
					// First non-flag, non-assignment element is the inner command
					return argv.slice(i);
				}
			}
			return null;
		}
		case "xargs": {
			// xargs is complex. Best-effort: scan for the last run of non-flag args.
			// Common forms: xargs cmd, xargs -I{} cmd, xargs -n1 cmd
			// We skip known flags and their values, then take the rest as inner cmd.
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (!a.startsWith("-")) {
					// First positional is treated as the inner command
					return argv.slice(i);
				}
				// Known flags that consume an argument
				if (
					a === "-I" ||
					a === "-i" ||
					a === "-n" ||
					a === "-P" ||
					a === "-s" ||
					a === "-E" ||
					a === "-d" ||
					a === "--delimiter" ||
					a === "--max-args" ||
					a === "--max-procs" ||
					a === "--replace"
				) {
					i += 2; // skip flag + its value
				} else if (a.startsWith("-I") || a.startsWith("-n") || a.startsWith("-P")) {
					// Inline value: -I{} -n2 -P4
					i++;
				} else {
					i++; // boolean flag, skip
				}
			}
			return null;
		}
		case "timeout": {
			// timeout [OPTION] DURATION COMMAND [ARG]...
			// Options: -s SIG, -k DURATION, --preserve-status, --foreground, --kill-after=DUR
			let i = 1;
			// Skip options
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-s" || a === "-k" || a === "--kill-after" || a === "--signal") {
					i += 2; // flag + value
				} else if (a.startsWith("--")) {
					i++; // boolean long flag (--preserve-status, --foreground)
				} else if (a.startsWith("-")) {
					i++; // short boolean flag
				} else {
					break; // first positional
				}
			}
			// Now argv[i] should be DURATION, argv[i+1] is the command
			if (i + 1 < argv.length) {
				return argv.slice(i + 1);
			}
			return null;
		}
		case "nice": {
			// nice [-n ADJUSTMENT] COMMAND [ARG]...
			// Also handles old-style: nice -N COMMAND (where N is a number)
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-n") {
					i += 2; // -n ADJUSTMENT
				} else if (/^-\d+$/.test(a)) {
					i++; // old-style: nice -10 cmd
				} else if (a.startsWith("-")) {
					i++; // unknown flag
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		case "nohup": {
			// nohup COMMAND [ARG]...
			if (argv.length > 1) return argv.slice(1);
			return null;
		}
		case "setsid": {
			// setsid [-c] [-w] [-f] COMMAND [ARG]...
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (
					a === "-c" ||
					a === "-w" ||
					a === "-f" ||
					a === "--ctty" ||
					a === "--wait" ||
					a === "--fork"
				) {
					i++;
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		case "stdbuf": {
			// stdbuf [-i MODE] [-o MODE] [-e MODE] COMMAND [ARG]...
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (
					a === "-i" ||
					a === "-o" ||
					a === "-e" ||
					a === "--input" ||
					a === "--output" ||
					a === "--error"
				) {
					i += 2; // flag + MODE
				} else if (a.startsWith("-")) {
					i++;
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		case "command": {
			// command [-p] [-v] [-V] cmd [args...]
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-p" || a === "-v" || a === "-V") {
					i++;
				} else if (a.startsWith("-")) {
					i++;
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		case "exec": {
			// exec [-l] [-c] [-a NAME] cmd [args...]
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-l" || a === "-c") {
					i++;
				} else if (a === "-a") {
					i += 2; // -a NAME
				} else if (a.startsWith("-")) {
					i++;
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		case "unbuffer": {
			// unbuffer COMMAND [ARG]...
			if (argv.length > 1) return argv.slice(1);
			return null;
		}
		case "time": {
			// time [-p] COMMAND [ARG]...
			let i = 1;
			while (i < argv.length) {
				const a = argv[i] ?? "";
				if (a === "-p" || a.startsWith("-")) {
					i++;
				} else {
					break;
				}
			}
			if (i < argv.length) return argv.slice(i);
			return null;
		}
		default:
			return null;
	}
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
