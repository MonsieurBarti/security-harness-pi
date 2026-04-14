import { describe, expect, it, vi } from "vitest";
import { makeReloadCommand } from "../../../src/commands/security-reload.js";

describe("makeReloadCommand", () => {
	it("invokes reload and notifies success when no warnings", async () => {
		const reload = vi.fn(async () => ({ warnings: [] }));
		const cmd = makeReloadCommand(reload);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		expect(reload).toHaveBeenCalled();
		expect(notify).toHaveBeenCalled();
		const [msg, level] = notify.mock.calls[0] as [string, string];
		expect(msg).toMatch(/reloaded/i);
		expect(level).toBe("info");
	});

	it("lists warnings", async () => {
		const reload = vi.fn(async () => ({ warnings: ["w1", "w2"] }));
		const cmd = makeReloadCommand(reload);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		const [msg, level] = notify.mock.calls[0] as [string, string];
		expect(msg).toContain("w1");
		expect(msg).toContain("w2");
		expect(level).toBe("warning");
	});

	it("reports error and keeps prior config on throw", async () => {
		const reload = vi.fn(async () => {
			throw new Error("file gone");
		});
		const cmd = makeReloadCommand(reload);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		const [msg, level] = notify.mock.calls[0] as [string, string];
		expect(msg).toContain("failed");
		expect(msg).toContain("file gone");
		expect(level).toBe("error");
	});
});
