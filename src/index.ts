import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BashAnalyzer } from "./analyzers/bash-analyzer.js";
import { makeReloadCommand } from "./commands/security-reload.js";
import { makeStatusCommand } from "./commands/security-status.js";
import { makeToolCallHandler } from "./hooks/tool-call.js";
import { loadConfig } from "./services/config-loader.js";
import { PolicyEngine } from "./services/policy-engine.js";
import { SessionLog } from "./services/session-log.js";
import type { ResolvedConfig } from "./types.js";

type State =
	| { kind: "uninitialized" }
	| {
			kind: "ready";
			resolved: ResolvedConfig;
			engine: PolicyEngine;
			log: SessionLog;
			analyzer: BashAnalyzer;
	  }
	| { kind: "crashed"; reason: string };

export default async function securityHarness(pi: ExtensionAPI): Promise<void> {
	let state: State = { kind: "uninitialized" };

	const globalDir = join(homedir(), ".pi", "agent");

	pi.on("session_start", async (_event, ctx) => {
		try {
			const analyzer = await BashAnalyzer.create();
			const resolved = await loadConfig({ cwd: ctx.cwd, globalDir });
			const engine = new PolicyEngine(resolved);
			const log = new SessionLog(pi as unknown as { appendEntry: (n: string, d: unknown) => void });
			state = { kind: "ready", resolved, engine, log, analyzer };
			if (resolved.warnings.length) {
				for (const w of resolved.warnings) {
					ctx.ui.notify(`security-harness: ${w}`, "warning");
				}
			}
			ctx.ui.setStatus(
				"security-harness",
				ctx.ui.theme.fg(
					"accent",
					`\u{1F6E1} ${resolved.forbiddenRules.length}F/${resolved.askRules.length}A`,
				),
			);
		} catch (e) {
			const reason = (e as Error).message;
			state = { kind: "crashed", reason };
			ctx.ui.notify(
				`security-harness failed to initialize: ${reason}. All bash/write/edit/read calls will be blocked for this session.`,
				"error",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		const shouldBlockGatedTools =
			event.toolName === "bash" ||
			event.toolName === "write" ||
			event.toolName === "edit" ||
			event.toolName === "read";

		if (state.kind === "crashed") {
			return shouldBlockGatedTools
				? { block: true, reason: `security-harness crashed at init: ${state.reason}` }
				: undefined;
		}

		if (state.kind === "uninitialized") {
			return shouldBlockGatedTools
				? {
						block: true,
						reason: "security-harness not yet initialized — retry after session_start completes",
					}
				: undefined;
		}

		// state.kind === "ready"
		if (!state.resolved.enabled) return undefined;

		const handler = makeToolCallHandler({
			analyzer: state.analyzer,
			engine: state.engine,
			log: state.log,
		});
		// ctx.ui.confirm signature differs (pi requires message: string, HookCtx allows body?: string);
		// a single cast is sufficient — no double as-unknown-as needed.
		return handler(event, ctx as Parameters<typeof handler>[1]);
	});

	const statusCmd = makeStatusCommand(() => {
		if (state.kind !== "ready") throw new Error("security-harness not initialized");
		return { resolved: state.resolved, log: state.log };
	});

	pi.registerCommand("security-status", {
		description: statusCmd.description,
		handler: async (rawArgs, ctx) => {
			return statusCmd.handler(rawArgs ? rawArgs.split(/\s+/) : [], {
				ui: { notify: (msg, level) => ctx.ui.notify(msg, level) },
			});
		},
	});

	const reloadCmd = makeReloadCommand(async () => {
		const resolved = await loadConfig({ cwd: process.cwd(), globalDir });
		if (state.kind === "ready") {
			// swap in place: keep analyzer + log, refresh resolved + engine
			state = {
				kind: "ready",
				resolved,
				engine: new PolicyEngine(resolved),
				analyzer: state.analyzer,
				log: state.log,
			};
		} else {
			throw new Error("security-harness not initialized yet");
		}
		return { warnings: resolved.warnings };
	});

	pi.registerCommand("security-reload", {
		description: reloadCmd.description,
		handler: async (rawArgs, ctx) => {
			return reloadCmd.handler(rawArgs ? rawArgs.split(/\s+/) : [], {
				ui: { notify: (msg, level) => ctx.ui.notify(msg, level) },
			});
		},
	});
}
