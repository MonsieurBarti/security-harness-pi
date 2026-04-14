import { describe, expect, it } from "vitest";
import type { Config, Rule, SimpleCommand, Verdict } from "../../src/types.js";

describe("types", () => {
	it("accepts a minimal forbid rule", () => {
		const r: Rule = {
			id: "forbid.test",
			description: "test",
			kind: "bash",
			severity: "forbid",
		};
		expect(r.id).toBe("forbid.test");
	});

	it("accepts a forbid verdict", () => {
		const v: Verdict = { action: "forbid", ruleId: "forbid.test", reason: "nope" };
		expect(v.action).toBe("forbid");
	});

	it("accepts a parsed simple command", () => {
		const c: SimpleCommand = {
			argv: ["rm", "-rf", "/"],
			redirects: [],
			pipeNext: undefined,
			raw: "rm -rf /",
		};
		expect(c.argv[0]).toBe("rm");
	});

	it("accepts a minimal config", () => {
		const c: Config = {
			enabled: true,
			mode: "enforce",
			forbid: [],
			ask: [],
			disable: [],
			rules: [],
		};
		expect(c.enabled).toBe(true);
	});
});
