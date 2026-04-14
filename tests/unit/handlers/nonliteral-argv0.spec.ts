import { describe, expect, it } from "vitest";
import { nonliteralArgv0 } from "../../../src/handlers/nonliteral-argv0.js";
import { sc } from "./_fixtures.js";

describe("nonliteralArgv0", () => {
	it("matches variable argv0", () => {
		const cmd = sc(["$X", "-rf", "/"], {
			argvKinds: ["variable", "literal", "literal"],
			argv0Basename: "$X",
		});
		expect(nonliteralArgv0.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});
	it("matches substitution argv0", () => {
		const cmd = sc(["$(echo rm)", "-rf", "/"], {
			argvKinds: ["substitution", "literal", "literal"],
			argv0Basename: "$(echo rm)",
		});
		expect(nonliteralArgv0.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});
	it("matches backtick argv0 (also substitution kind)", () => {
		const cmd = sc(["`echo rm`", "-rf", "/"], {
			argvKinds: ["substitution", "literal", "literal"],
			argv0Basename: "`echo rm`",
		});
		expect(nonliteralArgv0.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});
	it("matches process-substitution argv0", () => {
		const cmd = sc(["<(echo rm)"], {
			argvKinds: ["process-substitution"],
			argv0Basename: "<(echo rm)",
		});
		expect(nonliteralArgv0.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});
	it("does not match literal argv0", () => {
		const cmd = sc(["rm", "-rf", "/"]);
		expect(nonliteralArgv0.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(false);
	});
});
