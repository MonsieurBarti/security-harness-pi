import { describe, expect, it, vi } from "vitest";
import { makeStatusCommand } from "../../../src/commands/security-status.js";
import { SessionLog } from "../../../src/services/session-log.js";
import type { ResolvedConfig, Rule } from "../../../src/types.js";

function makeResolved(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
	return {
		enabled: true,
		mode: "enforce",
		forbiddenRules: [],
		askRules: [],
		warnings: [],
		sources: { defaults: true },
		...overrides,
	};
}

const fakeRule = {} as Rule;

describe("makeStatusCommand", () => {
	it("prints sources, counts, mode, enabled", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const state = {
			resolved: makeResolved({
				forbiddenRules: [fakeRule, fakeRule],
				askRules: [fakeRule],
				sources: { defaults: true, global: "/g", project: "/p" },
			}),
			log,
		};
		const cmd = makeStatusCommand(() => state);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		expect(notify).toHaveBeenCalledTimes(1);
		const msg = notify.mock.calls[0]?.[0] as string;
		expect(msg).toContain("forbid: 2");
		expect(msg).toContain("ask: 1");
		expect(msg).toContain("/g");
		expect(msg).toContain("/p");
		expect(msg).toContain("enforce");
		expect(msg).toContain("true");
	});

	it("includes warnings", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		const state = {
			resolved: makeResolved({ warnings: ["w1", "w2"] }),
			log,
		};
		const cmd = makeStatusCommand(() => state);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		const msg = notify.mock.calls[0]?.[0] as string;
		expect(msg).toContain("w1");
		expect(msg).toContain("w2");
	});

	it("includes last decisions from log", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		log.record({
			toolName: "bash",
			verdict: "forbid",
			ruleId: "forbid.test",
			input: "rm -rf /",
		});
		log.record({
			toolName: "bash",
			verdict: "ask-allowed",
			ruleId: "ask.foo",
			input: "npm install x",
		});
		const state = { resolved: makeResolved(), log };
		const cmd = makeStatusCommand(() => state);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		const msg = notify.mock.calls[0]?.[0] as string;
		expect(msg).toContain("forbid.test");
		expect(msg).toContain("ask.foo");
	});

	it("truncates long inputs to 80 chars", async () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		log.record({
			toolName: "bash",
			verdict: "forbid",
			ruleId: "r.x",
			input: "x".repeat(200),
		});
		const state = { resolved: makeResolved(), log };
		const cmd = makeStatusCommand(() => state);
		const notify = vi.fn();
		await cmd.handler([], { ui: { notify } });
		const msg = notify.mock.calls[0]?.[0] as string;
		const xCount = (msg.match(/x/g) ?? []).length;
		expect(xCount).toBeLessThanOrEqual(85);
	});
});
