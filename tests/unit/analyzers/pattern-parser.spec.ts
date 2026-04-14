import { describe, expect, it } from "vitest";
import { parsePattern } from "../../../src/analyzers/pattern-parser.js";
import { __registerHandlerForTests } from "../../../src/handlers/index.js";
import type { HandlerDefinition } from "../../../src/types.js";

const fakeHandler: HandlerDefinition = { match: () => true };
const fakeHandlerWithArgs: HandlerDefinition = {
	parseArgs: (s) =>
		(s ?? "")
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean),
	match: () => true,
};
__registerHandlerForTests("__test_simple", fakeHandler);
__registerHandlerForTests("__test_args", fakeHandlerWithArgs);

describe("parsePattern — bash basics", () => {
	it("parses Bash(rm:*)", () => {
		const r = parsePattern("Bash(rm:*)");
		expect(r.kind).toBe("bash");
		expect(r.match?.argv0).toBe("rm");
		expect(r.match?.argvAll).toBeUndefined();
		expect(r.match?.requiresPositional).toBeUndefined();
		expect(r.severity).toBe("forbid");
	});

	it("parses Bash(rm -rf:*) — leading args + wildcard", () => {
		const r = parsePattern("Bash(rm -rf:*)");
		expect(r.match?.argv0).toBe("rm");
		expect(r.match?.argvAll).toEqual(["-rf"]);
	});

	it("parses Bash(git push) — exact (no tail)", () => {
		const r = parsePattern("Bash(git push)");
		expect(r.match?.argv0).toBe("git");
		expect(r.match?.argvAll).toEqual(["push"]);
		expect(r.match?.requiresPositional).toBeUndefined();
	});

	it("parses :+ as requiresPositional", () => {
		const r = parsePattern("Bash(npm install:+)");
		expect(r.match?.requiresPositional).toBe(true);
	});

	it("respects severity argument", () => {
		const r = parsePattern("Bash(rm:*)", "ask");
		expect(r.severity).toBe("ask");
	});

	it("derives a stable id from input", () => {
		const a = parsePattern("Bash(rm:*)");
		const b = parsePattern("Bash(rm:*)");
		expect(a.id).toBe(b.id);
		expect(a.id).toMatch(/^inline\.bash\./);
	});

	it("description equals the original pattern string", () => {
		const r = parsePattern("Bash(rm -rf:*)");
		expect(r.description).toBe("Bash(rm -rf:*)");
	});

	it("throws on empty inner", () => {
		expect(() => parsePattern("Bash()")).toThrow();
	});

	it("throws on unknown tool", () => {
		expect(() => parsePattern("Foo(rm:*)")).toThrow();
	});

	it("throws on missing closing paren", () => {
		expect(() => parsePattern("Bash(rm")).toThrow();
	});
});

describe("parsePattern — path patterns", () => {
	it("parses Write(.env*)", () => {
		const r = parsePattern("Write(.env*)");
		expect(r.kind).toBe("path-write");
		expect(r.paths).toEqual([".env*"]);
	});

	it("parses Read(~/.ssh/id_*)", () => {
		const r = parsePattern("Read(~/.ssh/id_*)");
		expect(r.kind).toBe("path-read");
		expect(r.paths).toEqual(["~/.ssh/id_*"]);
	});

	it("parses Edit(.git/config)", () => {
		const r = parsePattern("Edit(.git/config)");
		expect(r.kind).toBe("path-write"); // Edit collapses to path-write
		expect(r.paths).toEqual([".git/config"]);
	});
});

describe("parsePattern — suffixes", () => {
	it("parses Bash(curl:*)|sh", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		expect(r.match?.pipedInto).toEqual(["sh"]);
	});

	it("parses Bash(git push)@__test_simple", () => {
		const r = parsePattern("Bash(git push)@__test_simple");
		expect(r.match?.custom).toBe("__test_simple");
		expect(r.match?.customArgs).toBeUndefined();
	});

	it("parses Bash(git push)@__test_args(release/*,hotfix/*)", () => {
		const r = parsePattern("Bash(git push)@__test_args(release/*,hotfix/*)");
		expect(r.match?.custom).toBe("__test_args");
		expect(r.match?.customArgs).toEqual(["release/*", "hotfix/*"]);
	});

	it("throws on unknown handler", () => {
		expect(() => parsePattern("Bash(git push)@does-not-exist")).toThrow(/unknown handler/);
	});

	it("parses ! negation prefix", () => {
		const r = parsePattern("!Bash(rm:*)");
		expect(r.negate).toBe(true);
		expect(r.match?.argv0).toBe("rm");
	});

	it("combines @handler and |pipe", () => {
		const r = parsePattern("Bash(curl:*)@__test_simple|sh");
		expect(r.match?.custom).toBe("__test_simple");
		expect(r.match?.pipedInto).toEqual(["sh"]);
	});

	it("throws on empty pipe target", () => {
		expect(() => parsePattern("Bash(curl:*)|")).toThrow();
	});
});
