import { basename } from "node:path";
import { getHandler } from "../handlers/index.js";
import type { Rule, RuleKind, Severity, SimpleCommand } from "../types.js";
import { PathAnalyzer } from "./path-analyzer.js";

export function parsePattern(input: string, severity: Severity = "forbid"): Rule {
	let src = input.trim();

	// Strip leading `!` for negation
	const negate = src.startsWith("!");
	if (negate) src = src.slice(1).trim();

	// Find top-level `|` — splits off pipedInto
	let pipedInto: string[] | undefined;
	const pipeIdx = findTopLevelPipe(src);
	if (pipeIdx !== -1) {
		const tail = src.slice(pipeIdx + 1).trim();
		if (!tail) throw new Error(`empty pipe target in pattern: ${input}`);
		pipedInto = [tail];
		src = src.slice(0, pipeIdx).trim();
	}

	// Find last top-level `@<handler>` suffix
	let custom: string | undefined;
	let customArgs: unknown;
	const atIdx = findTopLevelAt(src);
	if (atIdx !== -1) {
		const handlerPart = src.slice(atIdx + 1);
		src = src.slice(0, atIdx);
		const m = /^([a-z0-9_-]+)(?:\(([^)]*)\))?$/i.exec(handlerPart);
		if (!m) throw new Error(`invalid handler suffix in pattern "${input}": ${handlerPart}`);
		custom = m[1] as string;
		const argString = m[2];
		const def = getHandler(custom);
		if (!def) throw new Error(`unknown handler "${custom}" in pattern: ${input}`);
		if (def.parseArgs) {
			try {
				customArgs = def.parseArgs(argString);
			} catch (e) {
				throw new Error(
					`handler "${custom}" parseArgs failed for "${argString}": ${(e as Error).message}`,
				);
			}
		} else {
			customArgs = argString;
		}
	}

	// Tool(inner)
	const m = /^(Bash|Write|Edit|Read)\((.*)\)$/s.exec(src);
	if (!m) throw new Error(`invalid pattern (expected Tool(...)): ${input}`);
	const tool = m[1] as string;
	const inner = m[2] as string;
	if (!inner) throw new Error(`empty inner in pattern: ${input}`);

	const kind: RuleKind = tool === "Bash" ? "bash" : tool === "Read" ? "path-read" : "path-write";
	const id = `inline.${tool.toLowerCase()}.${stableHash(input)}`;

	if (kind === "bash") {
		const parsed = parseBashInner(inner, input);
		const match: Rule["match"] = {
			argv0: parsed.argv0,
			...(parsed.argvAll ? { argvAll: parsed.argvAll } : {}),
			...(parsed.argvExact ? { argvExact: true } : {}),
			...(parsed.requiresPositional ? { requiresPositional: true } : {}),
			...(custom ? { custom, customArgs } : {}),
			...(pipedInto ? { pipedInto } : {}),
		};
		return {
			id,
			description: input,
			kind,
			severity,
			match,
			...(negate ? { negate: true } : {}),
		};
	}

	// Path patterns
	return {
		id,
		description: input,
		kind,
		severity,
		paths: [inner],
		...(custom ? { match: { custom, customArgs } } : {}),
		...(negate ? { negate: true } : {}),
	};
}

function parseBashInner(
	inner: string,
	original: string,
): { argv0: string; argvAll?: string[]; requiresPositional?: boolean; argvExact?: boolean } {
	let core = inner.trim();
	let requiresPositional = false;
	let hasTailWildcard = false;
	if (core.endsWith(":*")) {
		core = core.slice(0, -2).trim();
		hasTailWildcard = true;
	} else if (core.endsWith(":+")) {
		core = core.slice(0, -2).trim();
		requiresPositional = true;
		hasTailWildcard = true;
	}
	if (!core) throw new Error(`empty argv0 in bash pattern: ${original}`);
	const parts = core.split(/\s+/).filter(Boolean);
	const argv0 = parts[0] as string;
	const argvAll = parts.length > 1 ? parts.slice(1) : undefined;
	return {
		argv0,
		...(argvAll ? { argvAll } : {}),
		...(requiresPositional ? { requiresPositional: true } : {}),
		...(!hasTailWildcard ? { argvExact: true } : {}),
	};
}

function findTopLevelPipe(s: string): number {
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "|" && depth === 0) return i;
	}
	return -1;
}

function findTopLevelAt(s: string): number {
	let depth = 0;
	let lastAt = -1;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "(") depth++;
		else if (c === ")") depth--;
		else if (c === "@" && depth === 0) lastAt = i;
	}
	return lastAt;
}

function stableHash(s: string): string {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

export function matchesBash(
	rule: Rule,
	cmd: SimpleCommand,
	allCommands: SimpleCommand[],
	cwd: string,
): boolean {
	if (rule.kind !== "bash") return false;
	const m = rule.match ?? {};

	if (m.argv0) {
		if (cmd.argvKinds[0] !== "literal") return false;
		const candidates = Array.isArray(m.argv0) ? m.argv0 : [m.argv0];
		if (!candidates.includes(cmd.argv0Basename)) return false;
	}

	if (m.argvAll) {
		for (let i = 0; i < m.argvAll.length; i++) {
			if (cmd.argv[1 + i] !== m.argvAll[i]) return false;
		}
	}

	if (m.argvExact) {
		if (cmd.argv.length !== 1 + (m.argvAll?.length ?? 0)) return false;
	}

	if (m.argvAny) {
		const has = m.argvAny.some((needle) => cmd.argv.some((a) => a.includes(needle)));
		if (!has) return false;
	}

	if (m.argvPattern) {
		if (!new RegExp(m.argvPattern).test(cmd.argv.join(" "))) return false;
	}

	if (m.requiresPositional) {
		const leading = m.argvAll?.length ?? 0;
		const tail = cmd.argv.slice(1 + leading);
		if (!tail.some((a) => !a.startsWith("-"))) return false;
	}

	if (m.pipedInto) {
		const next = cmd.pipeNext;
		if (!next) return false;
		if (next.argvKinds[0] !== "literal") return false;
		if (!m.pipedInto.includes(next.argv0Basename)) return false;
	}

	if (m.pipedFrom) {
		const prev = cmd.pipePrev;
		if (!prev) return false;
		if (prev.argvKinds[0] !== "literal") return false;
		if (!m.pipedFrom.includes(prev.argv0Basename)) return false;
	}

	if (m.redirectsTo) {
		const matchers = m.redirectsTo.map((g) => new RegExp(globToRegexSimple(g)));
		if (!cmd.redirects.some((r) => matchers.some((re) => re.test(r.target)))) return false;
	}

	if (m.custom) {
		const def = getHandler(m.custom);
		if (!def) return false;
		try {
			if (!def.match({ cwd, simpleCommand: cmd, allCommands, args: m.customArgs })) return false;
		} catch {
			return true; // fail-closed
		}
	}

	return true;
}

function globToRegexSimple(glob: string): string {
	return `^${glob
		.replace(/[-/\\^$+.()|[\]{}]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".")}$`;
}

export function matchesPath(rule: Rule, path: string, cwd: string): boolean {
	if (rule.kind !== "path-write" && rule.kind !== "path-read") return false;
	const pa = new PathAnalyzer(cwd);

	if (rule.paths && rule.paths.length > 0 && pa.matches(path, rule.paths)) {
		return true;
	}

	if (rule.match?.custom) {
		const def = getHandler(rule.match.custom);
		if (!def) return false;
		try {
			return def.match({
				cwd,
				simpleCommand: {
					argv: [path],
					argvKinds: ["literal"],
					argv0Basename: basename(path),
					redirects: [],
					source: "top",
					raw: path,
				},
				allCommands: [],
				args: rule.match.customArgs,
			});
		} catch {
			return true;
		}
	}

	return false;
}
