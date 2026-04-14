import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePattern } from "../analyzers/pattern-parser.js";
import { DEFAULT_ASK, DEFAULT_FORBID } from "../defaults.js";
import type { ResolvedConfig, Rule, Severity } from "../types.js";

export interface LoadOpts {
	cwd: string;
	globalDir: string;
}

interface RawConfig {
	enabled?: boolean;
	mode?: "enforce" | "warn";
	forbid?: (string | Rule)[];
	ask?: (string | Rule)[];
	disable?: string[];
	rules?: Rule[];
}

export async function loadConfig(opts: LoadOpts): Promise<ResolvedConfig> {
	const warnings: string[] = [];
	const sources: ResolvedConfig["sources"] = { defaults: true };

	const globalPath = join(opts.globalDir, "security-harness.json");
	const projectPath = join(opts.cwd, ".pi", "security-harness.json");

	let globalCfg: RawConfig | undefined;
	let projectCfg: RawConfig | undefined;

	if (existsSync(globalPath)) {
		try {
			globalCfg = JSON.parse(readFileSync(globalPath, "utf-8")) as RawConfig;
			sources.global = globalPath;
		} catch (e) {
			warnings.push(`could not parse ${globalPath}: ${(e as Error).message}`);
		}
	}
	if (existsSync(projectPath)) {
		try {
			projectCfg = JSON.parse(readFileSync(projectPath, "utf-8")) as RawConfig;
			sources.project = projectPath;
		} catch (e) {
			warnings.push(`could not parse ${projectPath}: ${(e as Error).message}`);
		}
	}

	let forbidden: Rule[] = [...DEFAULT_FORBID];
	let ask: Rule[] = [...DEFAULT_ASK];

	if (globalCfg?.disable?.length) {
		const toRemove = new Set(globalCfg.disable.map((s) => s.replace(/^default:/, "")));
		forbidden = forbidden.filter((r) => !toRemove.has(r.id));
		ask = ask.filter((r) => !toRemove.has(r.id));
	}
	if (globalCfg?.forbid) {
		forbidden.push(...normalizeList(globalCfg.forbid, "forbid", warnings));
	}
	if (globalCfg?.ask) {
		ask.push(...normalizeList(globalCfg.ask, "ask", warnings));
	}
	if (globalCfg?.rules) {
		for (const r of globalCfg.rules) {
			(r.severity === "forbid" ? forbidden : ask).push(r);
		}
	}

	if (projectCfg?.disable?.length) {
		warnings.push("project-level disable is ignored — edit the global config to relax defaults");
	}
	if (projectCfg?.enabled !== undefined) {
		warnings.push(
			"project-level 'enabled' is ignored — edit the global config to disable the harness",
		);
	}
	if (projectCfg?.mode !== undefined) {
		warnings.push("project-level 'mode' is ignored — edit the global config to change mode");
	}
	if (projectCfg?.forbid) {
		forbidden.push(...normalizeList(projectCfg.forbid, "forbid", warnings));
	}
	if (projectCfg?.ask) {
		ask.push(...normalizeList(projectCfg.ask, "ask", warnings));
	}
	if (projectCfg?.rules) {
		for (const r of projectCfg.rules) {
			(r.severity === "forbid" ? forbidden : ask).push(r);
		}
	}

	forbidden = dedupKeepLast(forbidden);
	ask = dedupKeepLast(ask);

	const enabled = globalCfg?.enabled ?? true;
	const mode = globalCfg?.mode ?? "enforce";

	return {
		enabled,
		mode,
		forbiddenRules: forbidden,
		askRules: ask,
		warnings,
		sources,
	};
}

function normalizeList(items: (string | Rule)[], severity: Severity, warnings: string[]): Rule[] {
	const out: Rule[] = [];
	for (const it of items) {
		if (typeof it === "string") {
			try {
				out.push(parsePattern(it, severity));
			} catch (e) {
				warnings.push(`bad pattern "${it}": ${(e as Error).message}`);
			}
		} else {
			out.push(it);
		}
	}
	return out;
}

function dedupKeepLast(rules: Rule[]): Rule[] {
	const seen = new Set<string>();
	const out: Rule[] = [];
	for (let i = rules.length - 1; i >= 0; i--) {
		const r = rules[i];
		if (!r || seen.has(r.id)) continue;
		seen.add(r.id);
		out.push(r);
	}
	return out.reverse();
}
