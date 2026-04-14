import { getHandler } from "../handlers/index.js";
import type { Rule, RuleKind, Severity } from "../types.js";

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
): { argv0: string; argvAll?: string[]; requiresPositional?: boolean } {
	let core = inner.trim();
	let requiresPositional = false;
	if (core.endsWith(":*")) {
		core = core.slice(0, -2).trim();
	} else if (core.endsWith(":+")) {
		core = core.slice(0, -2).trim();
		requiresPositional = true;
	}
	if (!core) throw new Error(`empty argv0 in bash pattern: ${original}`);
	const parts = core.split(/\s+/).filter(Boolean);
	const argv0 = parts[0] as string;
	const argvAll = parts.length > 1 ? parts.slice(1) : undefined;
	return {
		argv0,
		...(argvAll ? { argvAll } : {}),
		...(requiresPositional ? { requiresPositional: true } : {}),
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
