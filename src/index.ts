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

export default async function securityHarness(pi: ExtensionAPI): Promise<void> {
	let crashed = false;
	let crashReason = "";
	let resolved: ResolvedConfig | null = null;
	let engine: PolicyEngine | null = null;
	let log: SessionLog | null = null;
	let analyzer: BashAnalyzer | null = null;

	const globalDir = join(homedir(), ".pi", "agent");

	pi.on("session_start", async (_event, ctx) => {
		try {
			analyzer = await BashAnalyzer.create();
			resolved = await loadConfig({ cwd: ctx.cwd, globalDir });
			engine = new PolicyEngine(resolved);
			// ExtensionAPI.appendEntry is compatible with PiAppend — pass pi directly.
			log = new SessionLog(pi);
			if (resolved.warnings.length) {
				for (const w of resolved.warnings) {
					ctx.ui.notify(`security-harness: ${w}`, "warning");
				}
			}
			ctx.ui.setStatus(
				"security-harness",
				// ctx.ui.theme is Theme; fg(ThemeColor, string) returns string.
				// "accent" is a valid ThemeColor per the installed package types.
				ctx.ui.theme.fg(
					"accent",
					`\u{1F6E1} ${resolved.forbiddenRules.length}F/${resolved.askRules.length}A`,
				),
			);
		} catch (e) {
			crashed = true;
			crashReason = (e as Error).message;
			ctx.ui.notify(
				`security-harness failed to initialize: ${crashReason}. All bash/write/edit/read calls will be blocked for this session.`,
				"error",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (crashed) {
			if (
				event.toolName === "bash" ||
				event.toolName === "write" ||
				event.toolName === "edit" ||
				event.toolName === "read"
			) {
				return { block: true, reason: `security-harness crashed at init: ${crashReason}` };
			}
			return undefined;
		}
		// Not yet initialized (init race with session_start)
		if (!resolved || !engine || !log || !analyzer) {
			if (
				event.toolName === "bash" ||
				event.toolName === "write" ||
				event.toolName === "edit" ||
				event.toolName === "read"
			) {
				return {
					block: true,
					reason: "security-harness not yet initialized — retry after session_start completes",
				};
			}
			return undefined;
		}
		if (!resolved.enabled) return undefined; // explicit global opt-out

		// makeToolCallHandler returns an (event, ctx) => Promise<{block:true,reason:string}|undefined>.
		// HookCtx.ui.notify takes (msg: string, level?: string) — ExtensionUIContext.notify
		// takes (message: string, type?: "info"|"warning"|"error") which is a subtype, so
		// passing ctx.ui directly is safe. Same for HookCtx.ui.confirm.
		// ToolCallEvent.input is typed per tool (e.g. BashToolInput) while HookEvent.input
		// is Record<string,unknown>. Cast event to satisfy the internal HookEvent interface.
		const handler = makeToolCallHandler({ analyzer, engine, log });
		return handler(
			event as { toolName: string; input: Record<string, unknown> },
			// ExtensionContext satisfies HookCtx: it has hasUI, cwd, and ui.{confirm,notify}.
			ctx as unknown as Parameters<typeof handler>[1],
		);
	});

	// pi.registerCommand expects handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
	// Our internal Command.handler takes (args: string[], ctx: UiCtx) => Promise<void>.
	// Bridge: split the raw args string at the boundary; pass ctx.ui which satisfies UiCtx.ui.
	const statusCmd = makeStatusCommand(() => {
		if (!resolved || !log) throw new Error("security-harness not initialized");
		return { resolved, log };
	});

	pi.registerCommand("security-status", {
		description: statusCmd.description,
		handler: async (rawArgs, ctx) => {
			return statusCmd.handler(rawArgs ? rawArgs.split(/\s+/) : [], {
				ui: { notify: (msg, level) => ctx.ui.notify(msg, level as "info" | "warning" | "error") },
			});
		},
	});

	const reloadCmd = makeReloadCommand(async () => {
		resolved = await loadConfig({ cwd: process.cwd(), globalDir });
		engine = new PolicyEngine(resolved);
		return { warnings: resolved.warnings };
	});

	pi.registerCommand("security-reload", {
		description: reloadCmd.description,
		handler: async (rawArgs, ctx) => {
			return reloadCmd.handler(rawArgs ? rawArgs.split(/\s+/) : [], {
				ui: { notify: (msg, level) => ctx.ui.notify(msg, level as "info" | "warning" | "error") },
			});
		},
	});
}
