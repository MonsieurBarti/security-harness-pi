import { describe, expect, it } from "vitest";
import { parsePattern } from "../../../src/analyzers/pattern-parser.js";

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
