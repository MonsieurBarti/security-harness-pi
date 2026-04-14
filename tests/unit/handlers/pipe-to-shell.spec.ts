import { describe, expect, it } from "vitest";
import { pipeToShell } from "../../../src/handlers/pipe-to-shell.js";
import { sc } from "./_fixtures.js";

describe("pipeToShell", () => {
	it("matches echo | sh", () => {
		const a = sc(["echo", "stuff"]);
		const b = sc(["sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(pipeToShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(true);
	});

	it("matches transitively: echo | base64 -d | sh", () => {
		const a = sc(["echo", "stuff"]);
		const b = sc(["base64", "-d"]);
		const c = sc(["sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		b.pipeNext = c;
		c.pipePrev = b;
		expect(pipeToShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b, c] })).toBe(true);
	});

	it("does not match lone echo", () => {
		expect(
			pipeToShell.match({ cwd: "/", simpleCommand: sc(["echo", "hi"]), allCommands: [] }),
		).toBe(false);
	});

	it("does not match when source is already a shell (sh | bash)", () => {
		const a = sc(["sh"]);
		const b = sc(["bash"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(pipeToShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(false);
	});

	it("does not match non-shell terminal", () => {
		const a = sc(["echo", "hi"]);
		const b = sc(["grep", "foo"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(pipeToShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(false);
	});
});
