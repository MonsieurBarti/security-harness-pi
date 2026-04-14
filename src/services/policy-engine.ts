import { matchesBash, matchesPath } from "../analyzers/pattern-parser.js";
import type { BashAnalysis, ResolvedConfig, Verdict } from "../types.js";

function makeVerdict(
	action: "forbid" | "ask",
	ruleId: string,
	description: string,
	reason: string | undefined,
): Verdict {
	return {
		action,
		ruleId,
		description,
		...(reason !== undefined ? { reason } : {}),
	};
}

export class PolicyEngine {
	constructor(private cfg: ResolvedConfig) {}

	classifyBash(analysis: BashAnalysis, cwd: string): Verdict {
		if (analysis.parseError) {
			return this.wrap(
				makeVerdict(
					"forbid",
					"forbid.parse-error",
					"bash parse error",
					`Command could not be parsed: ${analysis.parseError}`,
				),
			);
		}

		let askHit: Verdict | null = null;

		for (const cmd of analysis.commands) {
			for (const rule of this.cfg.forbiddenRules) {
				if (rule.kind !== "bash") continue;
				const matched = matchesBash(rule, cmd, analysis.commands, cwd);
				const effective = matched !== !!rule.negate;
				if (effective) {
					return this.wrap(makeVerdict("forbid", rule.id, rule.description, rule.reason));
				}
			}
			if (!askHit) {
				for (const rule of this.cfg.askRules) {
					if (rule.kind !== "bash") continue;
					const matched = matchesBash(rule, cmd, analysis.commands, cwd);
					const effective = matched !== !!rule.negate;
					if (effective) {
						askHit = makeVerdict("ask", rule.id, rule.description, rule.reason);
						break;
					}
				}
			}
		}
		return askHit ? this.wrap(askHit) : { action: "allow" };
	}

	classifyPath(op: "write" | "edit" | "read", path: string, cwd: string): Verdict {
		const wantKind = op === "read" ? "path-read" : "path-write";

		for (const rule of this.cfg.forbiddenRules) {
			if (rule.kind !== wantKind) continue;
			const matched = matchesPath(rule, path, cwd);
			const effective = matched !== !!rule.negate;
			if (effective) {
				return this.wrap(makeVerdict("forbid", rule.id, rule.description, rule.reason));
			}
		}

		for (const rule of this.cfg.askRules) {
			if (rule.kind !== wantKind) continue;
			const matched = matchesPath(rule, path, cwd);
			const effective = matched !== !!rule.negate;
			if (effective) {
				return this.wrap(makeVerdict("ask", rule.id, rule.description, rule.reason));
			}
		}

		return { action: "allow" };
	}

	private wrap(v: Verdict): Verdict {
		if (this.cfg.mode === "warn" && v.action !== "allow") {
			return {
				action: "allow",
				...(v.ruleId !== undefined ? { ruleId: v.ruleId } : {}),
				...(v.description !== undefined ? { description: v.description } : {}),
				...(v.reason !== undefined ? { reason: v.reason } : {}),
			};
		}
		return v;
	}
}
