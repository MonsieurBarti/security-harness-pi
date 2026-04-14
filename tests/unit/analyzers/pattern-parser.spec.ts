import { describe, expect, it } from "vitest";
import { matchesBash, matchesPath, parsePattern } from "../../../src/analyzers/pattern-parser.js";
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

describe("matchesBash — pipedInto", () => {
	it("matches when piped into the named command", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		const a = sc(["curl", "http://x"]);
		const b = sc(["sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(matchesBash(r, a, [a, b], "/cwd")).toBe(true);
	});

	it("does not match without pipe", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		expect(matchesBash(r, sc(["curl", "http://x"]), [], "/cwd")).toBe(false);
	});

	it("does not match when piped into a different command", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		const a = sc(["curl", "http://x"]);
		const b = sc(["grep", "foo"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(matchesBash(r, a, [a, b], "/cwd")).toBe(false);
	});

	it("matches /bin/sh by basename when piped", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		const a = sc(["curl", "http://x"]);
		const b = sc(["/bin/sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(matchesBash(r, a, [a, b], "/cwd")).toBe(true);
	});

	it("does not match if pipe target argv0 is a substitution", () => {
		const r = parsePattern("Bash(curl:*)|sh");
		const a = sc(["curl", "http://x"]);
		const b = sc(["$(echo sh)"], { argvKinds: ["substitution"], argv0Basename: "$(echo sh)" });
		a.pipeNext = b;
		b.pipePrev = a;
		expect(matchesBash(r, a, [a, b], "/cwd")).toBe(false);
	});
});

describe("matchesBash — custom handler", () => {
	it("calls the handler match function", () => {
		let called = false;
		__registerHandlerForTests("__test_observed", {
			match: () => {
				called = true;
				return true;
			},
		});
		const r = parsePattern("Bash(git push)@__test_observed");
		expect(matchesBash(r, sc(["git", "push"]), [], "/cwd")).toBe(true);
		expect(called).toBe(true);
	});

	it("returns false when handler returns false", () => {
		__registerHandlerForTests("__test_false", { match: () => false });
		const r = parsePattern("Bash(git push)@__test_false");
		expect(matchesBash(r, sc(["git", "push"]), [], "/cwd")).toBe(false);
	});

	it("fail-closes when handler throws", () => {
		__registerHandlerForTests("__test_throws", {
			match: () => {
				throw new Error("boom");
			},
		});
		const r = parsePattern("Bash(git push)@__test_throws");
		expect(matchesBash(r, sc(["git", "push"]), [], "/cwd")).toBe(true);
	});

	it("passes parsed customArgs to handler", () => {
		let received: unknown;
		__registerHandlerForTests("__test_args_check", {
			parseArgs: (s) => (s ?? "").split(",").map((x) => x.trim()),
			match: (ctx) => {
				received = ctx.args;
				return true;
			},
		});
		const r = parsePattern("Bash(git push)@__test_args_check(release/*,hotfix/*)");
		matchesBash(r, sc(["git", "push"]), [], "/cwd");
		expect(received).toEqual(["release/*", "hotfix/*"]);
	});
});

describe("matchesPath", () => {
	it("matches relative globs against project-relative paths", () => {
		const r = parsePattern("Write(.env*)");
		expect(matchesPath(r, ".env", "/proj")).toBe(true);
		expect(matchesPath(r, ".env.local", "/proj")).toBe(true);
		expect(matchesPath(r, "src/app.ts", "/proj")).toBe(false);
	});

	it("does not match absolute path with a relative glob", () => {
		const r = parsePattern("Write(.env*)");
		expect(matchesPath(r, "/etc/.env", "/proj")).toBe(false);
	});

	it("matches tilde glob against home-rooted absolute path", () => {
		const home = process.env.HOME ?? "/h";
		const r = parsePattern("Read(~/.ssh/id_*)");
		expect(matchesPath(r, `${home}/.ssh/id_rsa`, "/proj")).toBe(true);
	});

	it("dispatches to a custom handler when set", () => {
		let receivedPath: string | undefined;
		__registerHandlerForTests("__test_path_capture", {
			match: (ctx) => {
				receivedPath = ctx.simpleCommand.argv[0];
				return true;
			},
		});
		const r = parsePattern("Write(.env*)@__test_path_capture");
		// The path "src/app.ts" doesn't match the .env* glob, so handler is consulted
		expect(matchesPath(r, "src/app.ts", "/proj")).toBe(true);
		expect(receivedPath).toBe("src/app.ts");
	});

	it("returns false when no path matches and no handler matches", () => {
		__registerHandlerForTests("__test_path_no", { match: () => false });
		const r = parsePattern("Write(this-does-not-exist-glob)@__test_path_no");
		expect(matchesPath(r, "src/app.ts", "/proj")).toBe(false);
	});

	it("returns true when path matches even if handler would return false", () => {
		__registerHandlerForTests("__test_path_no2", { match: () => false });
		const r = parsePattern("Write(.env*)@__test_path_no2");
		// Path matches; handler is short-circuited
		expect(matchesPath(r, ".env", "/proj")).toBe(true);
	});

	it("fail-closes when the path-handler throws", () => {
		__registerHandlerForTests("__test_path_throws", {
			match: () => {
				throw new Error("boom");
			},
		});
		const r = parsePattern("Write(this-does-not-exist-glob)@__test_path_throws");
		expect(matchesPath(r, "src/app.ts", "/proj")).toBe(true);
	});

	it("returns false for a non-path rule kind", () => {
		const r = parsePattern("Bash(rm:*)");
		expect(matchesPath(r, "src/app.ts", "/proj")).toBe(false);
	});
});
