import { describe, expect, it, vi } from "vitest";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;
type CommandHandler = (a: string, c: unknown) => Promise<void>;
type Cmd = { description: string; handler: CommandHandler };

describe("extension entry — state machine", () => {
	async function loadEntry() {
		// Re-import fresh per test because state is module-scoped
		vi.resetModules();
		return (await import("../../src/index.js")).default;
	}

	function makePi() {
		const handlers: Map<string, Handler> = new Map();
		const commands: Map<string, Cmd> = new Map();
		const appendEntry = vi.fn();
		const pi = {
			on(name: string, fn: Handler) {
				handlers.set(name, fn);
			},
			registerCommand(name: string, cmd: Cmd) {
				commands.set(name, cmd);
			},
			appendEntry,
		};
		return { pi, handlers, commands, appendEntry };
	}

	function makeCtx() {
		return {
			cwd: `/tmp/nonexistent-project-${Math.random().toString(36).slice(2)}`,
			hasUI: true,
			ui: {
				confirm: vi.fn(async () => true),
				notify: vi.fn(),
				setStatus: vi.fn(),
				theme: { fg: (_color: string, text: string) => text },
			},
		};
	}

	it("blocks bash tool_call while uninitialized (pre-session_start race)", async () => {
		const entry = await loadEntry();
		const { pi, handlers } = makePi();
		await entry(pi as never);
		// session_start not yet fired — state is "uninitialized"
		const toolCall = handlers.get("tool_call");
		expect(toolCall).toBeDefined();
		const r = await toolCall?.({ toolName: "bash", input: { command: "rm -rf /" } }, makeCtx());
		expect(r).toEqual(expect.objectContaining({ block: true }));
		expect((r as { reason: string }).reason).toContain("not yet initialized");
	});

	it("passes through unrelated tools while uninitialized", async () => {
		const entry = await loadEntry();
		const { pi, handlers } = makePi();
		await entry(pi as never);
		const toolCall = handlers.get("tool_call");
		expect(toolCall).toBeDefined();
		const r = await toolCall?.({ toolName: "grep", input: {} }, makeCtx());
		expect(r).toBeUndefined();
	});

	it("transitions to ready after session_start and routes bash through policy", async () => {
		const entry = await loadEntry();
		const { pi, handlers } = makePi();
		await entry(pi as never);
		const ctx = makeCtx();
		const sessionStart = handlers.get("session_start");
		expect(sessionStart).toBeDefined();
		await sessionStart?.({}, ctx);
		// now state is "ready" with defaults; sudo is forbidden
		const toolCall = handlers.get("tool_call");
		expect(toolCall).toBeDefined();
		const r = await toolCall?.({ toolName: "bash", input: { command: "sudo ls" } }, ctx);
		expect(r).toEqual(expect.objectContaining({ block: true }));
	});

	it("sets status bar on successful init", async () => {
		const entry = await loadEntry();
		const { pi, handlers } = makePi();
		await entry(pi as never);
		const ctx = makeCtx();
		const sessionStart = handlers.get("session_start");
		expect(sessionStart).toBeDefined();
		await sessionStart?.({}, ctx);
		expect(ctx.ui.setStatus).toHaveBeenCalledWith("security-harness", expect.stringContaining("🛡"));
	});

	it("blocks bash after crashed state (forced via analyzer failure)", async () => {
		vi.resetModules();
		vi.doMock("../../src/analyzers/bash-analyzer.js", () => ({
			BashAnalyzer: {
				create: async () => {
					throw new Error("wasm missing");
				},
			},
		}));
		const entry = (await import("../../src/index.js")).default;
		const { pi, handlers } = makePi();
		await entry(pi as never);
		const ctx = makeCtx();
		await handlers.get("session_start")?.({}, ctx);
		const r = await handlers.get("tool_call")?.(
			{ toolName: "bash", input: { command: "ls" } },
			ctx,
		);
		expect(r).toEqual(expect.objectContaining({ block: true }));
		expect((r as { reason: string }).reason).toContain("wasm missing");
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("failed to initialize"),
			"error",
		);
		vi.doUnmock("../../src/analyzers/bash-analyzer.js");
	});

	it("registers /security-status and /security-reload commands", async () => {
		const entry = await loadEntry();
		const { pi, commands } = makePi();
		await entry(pi as never);
		expect(commands.get("security-status")).toBeDefined();
		expect(commands.get("security-reload")).toBeDefined();
	});

	it("/security-status throws before init", async () => {
		const entry = await loadEntry();
		const { pi, commands } = makePi();
		await entry(pi as never);
		const notify = vi.fn();
		const statusCmd = commands.get("security-status");
		expect(statusCmd).toBeDefined();
		await expect(statusCmd?.handler("", { ui: { notify } })).rejects.toThrow("not initialized");
	});

	it("/security-status works after init", async () => {
		const entry = await loadEntry();
		const { pi, handlers, commands } = makePi();
		await entry(pi as never);
		await handlers.get("session_start")?.({}, makeCtx());
		const notify = vi.fn();
		const statusCmd = commands.get("security-status");
		expect(statusCmd).toBeDefined();
		await statusCmd?.handler("", { ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const msg = (notify.mock.calls[0] as unknown[])[0] as string;
		expect(msg).toContain("security-harness");
	});
});
