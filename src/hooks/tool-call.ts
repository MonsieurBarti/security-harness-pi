import type { BashAnalyzer } from "../analyzers/bash-analyzer.js";
import type { PolicyEngine } from "../services/policy-engine.js";
import type { SessionLog } from "../services/session-log.js";
import type { Verdict } from "../types.js";

interface Deps {
	analyzer: BashAnalyzer;
	engine: PolicyEngine;
	log: SessionLog;
}

interface HookEvent {
	toolName: string;
	input: Record<string, unknown>;
}

interface HookCtx {
	hasUI: boolean;
	cwd: string;
	ui: {
		confirm: (title: string, body?: string) => Promise<boolean>;
		notify: (msg: string, level?: string) => void;
	};
}

type HookReturn = { block: true; reason: string } | undefined;

export function makeToolCallHandler(
	deps: Deps,
): (event: HookEvent, ctx: HookCtx) => Promise<HookReturn> {
	return async function onToolCall(event, ctx) {
		if (event.toolName === "bash") return handleBash(event, ctx, deps);
		if (event.toolName === "write" || event.toolName === "edit") {
			return handlePath("write", event, ctx, deps);
		}
		if (event.toolName === "read") return handlePath("read", event, ctx, deps);
		return undefined;
	};
}

async function handleBash(event: HookEvent, ctx: HookCtx, deps: Deps): Promise<HookReturn> {
	const raw = event.input.command;
	if (typeof raw !== "string") {
		return { block: true, reason: "bash 'command' input is missing or not a string" };
	}
	const analysis = deps.analyzer.analyze(raw);
	const verdict = deps.engine.classifyBash(analysis, ctx.cwd);
	return runVerdict("bash", verdict, raw, ctx, deps);
}

async function handlePath(
	op: "write" | "read",
	event: HookEvent,
	ctx: HookCtx,
	deps: Deps,
): Promise<HookReturn> {
	const raw = event.input.path;
	if (typeof raw !== "string") {
		return { block: true, reason: `${event.toolName} 'path' input is missing or not a string` };
	}
	const verdict = deps.engine.classifyPath(op, raw, ctx.cwd);
	return runVerdict(event.toolName, verdict, raw, ctx, deps);
}

async function runVerdict(
	toolName: string,
	verdict: Verdict,
	input: string,
	ctx: HookCtx,
	deps: Deps,
): Promise<HookReturn> {
	const verdictMeta = {
		...(verdict.ruleId !== undefined ? { ruleId: verdict.ruleId } : {}),
		...(verdict.description !== undefined ? { description: verdict.description } : {}),
	};

	if (verdict.action === "allow") {
		if (verdict.ruleId) {
			deps.log.record({ toolName, verdict: "allow", input, ...verdictMeta });
		}
		return undefined;
	}

	if (verdict.action === "forbid") {
		deps.log.record({ toolName, verdict: "forbid", input, ...verdictMeta });
		return { block: true, reason: reasonFor(verdict) };
	}

	// ask
	if (!ctx.hasUI) {
		deps.log.record({
			toolName,
			verdict: "ask-denied",
			input,
			uiAvailable: false,
			...verdictMeta,
		});
		return {
			block: true,
			reason: `${reasonFor(verdict)} (no UI available for approval)`,
		};
	}

	const title = `⚠ ${verdict.description ?? verdict.ruleId ?? "security check"}`;
	const body = toolName === "bash" ? `Command: ${input}\n\nAllow?` : `Path: ${input}\n\nAllow?`;

	let ok = false;
	try {
		ok = await ctx.ui.confirm(title, body);
	} catch {
		ok = false;
	}

	deps.log.record({
		toolName,
		verdict: ok ? "ask-allowed" : "ask-denied",
		input,
		userChoice: ok ? "yes" : "no",
		uiAvailable: true,
		...verdictMeta,
	});

	return ok
		? undefined
		: { block: true, reason: `Denied by user (${verdict.ruleId ?? "unknown"})` };
}

function reasonFor(v: Verdict): string {
	return v.reason ?? v.description ?? v.ruleId ?? "blocked by security-harness";
}
