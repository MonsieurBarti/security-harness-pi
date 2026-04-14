import type { SessionLog } from "../services/session-log.js";
import type { ResolvedConfig } from "../types.js";
import type { Command } from "./types.js";

interface State {
	resolved: ResolvedConfig;
	log: SessionLog;
}

export function makeStatusCommand(getState: () => State): Command {
	return {
		description: "Show security-harness configuration and recent decisions",
		handler: async (_args, ctx) => {
			const { resolved, log } = getState();
			const lines: string[] = [
				"security-harness",
				"  sources:",
				"    defaults: yes",
				`    global:   ${resolved.sources.global ?? "(none)"}`,
				`    project:  ${resolved.sources.project ?? "(none)"}`,
				`  mode:     ${resolved.mode}`,
				`  enabled:  ${resolved.enabled}`,
				`  rules:    forbid: ${resolved.forbiddenRules.length}  ask: ${resolved.askRules.length}`,
			];

			if (resolved.warnings.length) {
				lines.push("  warnings:");
				for (const w of resolved.warnings) lines.push(`    - ${w}`);
			}

			const last = log.recent(20);
			if (last.length) {
				lines.push("  last decisions:");
				for (const e of last) {
					const snippet = e.input.slice(0, 80);
					lines.push(`    [${e.ts}] ${e.verdict} ${e.ruleId ?? ""} — ${snippet}`);
				}
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	};
}
