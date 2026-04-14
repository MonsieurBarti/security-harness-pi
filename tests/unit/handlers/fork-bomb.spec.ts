import { describe, expect, it } from "vitest";
import { forkBomb } from "../../../src/handlers/fork-bomb.js";
import { sc } from "./_fixtures.js";

describe("forkBomb", () => {
	it("matches when all commands are bare ':'", () => {
		const a = sc([":"]);
		const b = sc([":"]);
		const c = sc([":"]);
		expect(forkBomb.match({ cwd: "/", simpleCommand: a, allCommands: [a, b, c] })).toBe(true);
	});
	it("does not match when only one ':' command", () => {
		const a = sc([":"]);
		expect(forkBomb.match({ cwd: "/", simpleCommand: a, allCommands: [a] })).toBe(false);
	});
	it("does not match when mixed commands", () => {
		const a = sc([":"]);
		const b = sc(["echo", "hi"]);
		expect(forkBomb.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(false);
	});
});
