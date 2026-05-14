import { PathAnalyzer } from "../analyzers/path-analyzer.js";
import type { FileArgDef, FileArgSpec, HandlerDefinition, ResolvedConfig } from "../types.js";

/** Output redirect operators that write to a file. */
const OUTPUT_REDIRECT_OPS = new Set([
	">",
	">>",
	">|",
	"&>",
	"1>",
	"1>>",
	"1>|",
	"2>",
	"2>>",
	"2>|",
	"<>",
]);

/**
 * Hard-coded signatures for common file-writing / file-modifying commands.
 * Users can extend or override via `bashFileSignatures` in security-harness.json.
 */
const BUILTIN_SIGNATURES: FileArgSpec[] = [
	{ command: "cp", fileArgs: { type: "all-positional" } },
	{ command: "mv", fileArgs: { type: "all-positional" } },
	{ command: "ln", fileArgs: { type: "all-positional" } },
	{ command: "install", fileArgs: { type: "all-positional" } },
	{ command: "tee", fileArgs: { type: "all-positional" } },
	{ command: "sponge", fileArgs: { type: "all-positional" } },
	{ command: "rsync", fileArgs: { type: "all-positional" } },
	{ command: "touch", fileArgs: { type: "all-positional" } },
	{ command: "sed", fileArgs: { type: "last-positional", count: 1 } },
	{ command: "perl", fileArgs: { type: "last-positional", count: 1 } },
	{ command: "awk", fileArgs: { type: "last-positional", count: 1 } },
	{ command: "ex", fileArgs: { type: "last-positional", count: 1 } },
	{ command: "ed", fileArgs: { type: "last-positional", count: 1 } },
];

function getSignatures(config: ResolvedConfig): Record<string, FileArgDef> {
	const merged: FileArgSpec[] = [...BUILTIN_SIGNATURES, ...(config.bashFileSignatures ?? [])];
	const map: Record<string, FileArgDef> = {};
	for (const sig of merged) {
		if (sig?.command && sig?.fileArgs) {
			map[sig.command] = sig.fileArgs;
		}
	}
	return map;
}

/**
 * Conservative flag skipper.
 * Any token starting with "-" (and not just "-") is treated as a flag;
 * we consume it and the immediately following token as flag+arg.
 * "--" ends flag processing; everything after is positional.
 */
function skipFlags(argv: string[]): string[] {
	const nonFlags: string[] = [];
	let i = 1; // skip argv[0] (the command itself)
	while (i < argv.length) {
		const token = argv[i];
		if (token === undefined) break;
		if (token === "--") {
			i++;
			while (i < argv.length) {
				const next = argv[i];
				if (next === undefined) break;
				nonFlags.push(next);
				i++;
			}
			break;
		}
		if (token.startsWith("-") && token.length > 1) {
			// Flag — skip it and the next token (conservatively treated as flag arg)
			i += 2;
		} else {
			nonFlags.push(token);
			i++;
		}
	}
	return nonFlags;
}

function extractFileArgs(argv: string[], spec: FileArgDef): string[] {
	const nonFlags = skipFlags(argv);
	switch (spec.type) {
		case "all-positional":
			return nonFlags;
		case "last-positional": {
			const count = spec.count ?? 1;
			return nonFlags.slice(-count);
		}
		default:
			return [];
	}
}

/**
 * Heuristic: does this token look like a file path?
 * Catches absolute, home-relative, explicit relative, and anything with a slash.
 */
function isPathCandidate(token: string): boolean {
	return (
		token.startsWith("/") ||
		token.startsWith("~") ||
		token.startsWith("./") ||
		token.startsWith("../") ||
		token.includes("/")
	);
}

function isOutputRedirect(op: string): boolean {
	return OUTPUT_REDIRECT_OPS.has(op);
}

export const bashFileEscape: HandlerDefinition = {
	reason: "Bash command writes to or modifies a file outside the project root.",
	match: ({ cwd, simpleCommand, config }) => {
		if (!config) return false;
		const pa = new PathAnalyzer(cwd);

		// 1. Check output redirects — any command can write via > / >> / &>
		for (const redirect of simpleCommand.redirects) {
			if (
				isOutputRedirect(redirect.op) &&
				isPathCandidate(redirect.target) &&
				pa.escapesProject(redirect.target)
			) {
				return true;
			}
		}

		// 2. Check command-specific positional file arguments
		const sigs = getSignatures(config);
		const spec = sigs[simpleCommand.argv0Basename];
		if (!spec) return false;

		const candidates = extractFileArgs(simpleCommand.argv, spec);
		for (const candidate of candidates) {
			if (isPathCandidate(candidate) && pa.escapesProject(candidate)) {
				return true;
			}
		}

		return false;
	},
};
