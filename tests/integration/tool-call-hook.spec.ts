import { beforeAll, describe, expect, it, vi } from "vitest";
import { BashAnalyzer } from "../../src/analyzers/bash-analyzer.js";
import { DEFAULT_ASK, DEFAULT_FORBID } from "../../src/defaults.js";
import {
	__resetResolvers,
	__setDefaultBranchResolver,
} from "../../src/handlers/git-push-default-branch.js";
import { makeToolCallHandler } from "../../src/hooks/tool-call.js";
import { PolicyEngine } from "../../src/services/policy-engine.js";
import { SessionLog } from "../../src/services/session-log.js";

let analyzer: BashAnalyzer;
beforeAll(async () => {
	analyzer = await BashAnalyzer.create();
});

function makeEngine(mode: "enforce" | "warn" = "enforce"): PolicyEngine {
	return new PolicyEngine({
		enabled: true,
		mode,
		forbiddenRules: DEFAULT_FORBID,
		askRules: DEFAULT_ASK,
		warnings: [],
		sources: { defaults: true },
	});
}

function makeCtx(hasUI: boolean, confirmResult = true) {
	return {
		hasUI,
		cwd: "/proj",
		ui: {
			confirm: vi.fn(async () => confirmResult),
			notify: vi.fn(),
		},
	};
}

describe("tool_call hook", () => {
	it("forbids rm -rf / without prompting", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "bash", input: { command: "rm -rf /" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("asks and proceeds on Yes for git push main", async () => {
		__setDefaultBranchResolver(() => "main");
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true, true);
		const r = await h({ toolName: "bash", input: { command: "git push origin main" } }, ctx);
		expect(r).toBeUndefined();
		expect(ctx.ui.confirm).toHaveBeenCalled();
		__resetResolvers();
	});

	it("asks and blocks on No", async () => {
		__setDefaultBranchResolver(() => "main");
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true, false);
		const r = await h({ toolName: "bash", input: { command: "git push origin main" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
		__resetResolvers();
	});

	it("blocks ask rules when !hasUI", async () => {
		__setDefaultBranchResolver(() => "main");
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(false);
		const r = await h({ toolName: "bash", input: { command: "git push origin main" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
		expect(r?.reason).toContain("no UI");
		__resetResolvers();
	});

	it("lets unrelated tool calls through", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "grep", input: {} }, ctx);
		expect(r).toBeUndefined();
	});

	it("blocks write to /etc/hosts", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "write", input: { path: "/etc/hosts" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});

	it("edit tool maps to path-write kind (ask on .env)", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true, true);
		const r = await h({ toolName: "edit", input: { path: ".env" } }, ctx);
		expect(r).toBeUndefined();
		expect(ctx.ui.confirm).toHaveBeenCalled();
	});

	it("asks on read of .env and returns log entry", async () => {
		const appendEntry = vi.fn();
		const log = new SessionLog({ appendEntry });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true, true);
		const r = await h({ toolName: "read", input: { path: ".env" } }, ctx);
		expect(r).toBeUndefined();
		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(appendEntry).toHaveBeenCalled();
		const entry = (appendEntry.mock.calls[0] as unknown[])[1] as {
			verdict: string;
			userChoice: string;
		};
		expect(entry.verdict).toBe("ask-allowed");
		expect(entry.userChoice).toBe("yes");
	});

	it("warn mode allows and logs without blocking", async () => {
		const appendEntry = vi.fn();
		const log = new SessionLog({ appendEntry });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine("warn"), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "bash", input: { command: "sudo rm -rf /" } }, ctx);
		expect(r).toBeUndefined();
		expect(appendEntry).toHaveBeenCalled();
	});

	it("treats confirm rejection as No (block)", async () => {
		__setDefaultBranchResolver(() => "main");
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = {
			hasUI: true,
			cwd: "/proj",
			ui: {
				confirm: vi.fn(async () => {
					throw new Error("user dismissed");
				}),
				notify: vi.fn(),
			},
		};
		const r = await h({ toolName: "bash", input: { command: "git push origin main" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
		__resetResolvers();
	});

	it("blocks on missing path input (fail-closed)", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "write", input: {} }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});

	it("blocks bash with non-string command input (fail-closed)", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "bash", input: { command: { toString: () => "rm" } } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});

	it("blocks bash with missing command input", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "bash", input: {} }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});

	it("blocks write with non-string path input", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const h = makeToolCallHandler({ analyzer, engine: makeEngine(), log });
		const ctx = makeCtx(true);
		const r = await h({ toolName: "write", input: { path: 42 } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});
});
