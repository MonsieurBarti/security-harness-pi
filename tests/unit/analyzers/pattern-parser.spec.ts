import { describe, expect, it } from "vitest";
import { matchesBash, parsePattern } from "../../../src/analyzers/pattern-parser.js";
import { __registerHandlerForTests } from "../../../src/handlers/index.js";
import type { HandlerDefinition, SimpleCommand } from "../../../src/types.js";

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

const sc = (argv: string[], overrides: Partial<SimpleCommand> = {}): SimpleCommand => ({
	argv,
	argvKinds: argv.map(() => "literal" as const),
	argv0Basename: argv[0]?.includes("/")
		? argv[0].slice(argv[0].lastIndexOf("/") + 1)
		: (argv[0] ?? ""),
	redirects: [],
	source: "top",
	raw: argv.join(" "),
	...overrides,
});

describe("matchesBash — argv0", () => {
	it("matches by literal argv0", () => {
		const r = parsePattern("Bash(rm:*)");
		expect(matchesBash(r, sc(["rm", "-rf", "/tmp"]), [], "/cwd")).toBe(true);
		expect(matchesBash(r, sc(["ls"]), [], "/cwd")).toBe(false);
	});

	it("matches /bin/rm by argv0Basename", () => {
		const r = parsePattern("Bash(rm:*)");
		const cmd = sc(["/bin/rm", "-rf", "/tmp"]);
		expect(cmd.argv0Basename).toBe("rm");
		expect(matchesBash(r, cmd, [], "/cwd")).toBe(true);
	});

	it("refuses to match when argv0Kind is variable", () => {
		const r = parsePattern("Bash(rm:*)");
		const cmd = sc(["$X", "-rf", "/tmp"], {
			argvKinds: ["variable", "literal", "literal"],
			argv0Basename: "$X",
		});
		expect(matchesBash(r, cmd, [], "/cwd")).toBe(false);
	});

	it("refuses to match when argv0Kind is substitution", () => {
		const r = parsePattern("Bash(rm:*)");
		const cmd = sc(["$(echo rm)", "-rf", "/tmp"], {
			argvKinds: ["substitution", "literal", "literal"],
			argv0Basename: "$(echo rm)",
		});
		expect(matchesBash(r, cmd, [], "/cwd")).toBe(false);
	});
});

describe("matchesBash — argvAll positional", () => {
	it("matches when argvAll is a prefix (with :*)", () => {
		const r = parsePattern("Bash(rm -rf:*)");
		expect(matchesBash(r, sc(["rm", "-rf", "/tmp"]), [], "/cwd")).toBe(true);
		expect(matchesBash(r, sc(["rm", "-i", "/tmp"]), [], "/cwd")).toBe(false);
	});

	it("exact match when no tail wildcard", () => {
		const r = parsePattern("Bash(git push)");
		expect(matchesBash(r, sc(["git", "push"]), [], "/cwd")).toBe(true);
		expect(matchesBash(r, sc(["git", "push", "origin"]), [], "/cwd")).toBe(false);
	});

	it("exact match returns true on argv0-only with no argvAll", () => {
		// Bash(ls) should match exactly `ls` — no args
		const r = parsePattern("Bash(ls)");
		expect(matchesBash(r, sc(["ls"]), [], "/cwd")).toBe(true);
		expect(matchesBash(r, sc(["ls", "-la"]), [], "/cwd")).toBe(false);
	});
});

describe("matchesBash — requiresPositional (:+)", () => {
	it(":+ requires a non-flag positional after argvAll", () => {
		const r = parsePattern("Bash(npm install:+)");
		expect(matchesBash(r, sc(["npm", "install", "react"]), [], "/cwd")).toBe(true);
		expect(matchesBash(r, sc(["npm", "install"]), [], "/cwd")).toBe(false);
		expect(matchesBash(r, sc(["npm", "install", "--save-dev"]), [], "/cwd")).toBe(false);
		expect(matchesBash(r, sc(["npm", "install", "--save-dev", "react"]), [], "/cwd")).toBe(true);
	});
});
