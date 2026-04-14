import { describe, expect, it } from "vitest";
import { curlPipeShell } from "../../../src/handlers/curl-pipe-shell.js";
import { sc } from "./_fixtures.js";

describe("curlPipeShell", () => {
	it("matches curl | sh", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(true);
	});

	it("matches wget ... | bash", () => {
		const a = sc(["wget", "-qO-", "http://x"]);
		const b = sc(["bash"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(true);
	});

	it("does not match lone curl", () => {
		expect(
			curlPipeShell.match({
				cwd: "/",
				simpleCommand: sc(["curl", "http://x"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("does not match curl | grep", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["grep", "foo"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(false);
	});

	it("matches transitively through base64 -d", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["base64", "-d"]);
		const c = sc(["sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		b.pipeNext = c;
		c.pipePrev = b;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b, c] })).toBe(true);
	});

	it("matches /bin/sh by basename", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["/bin/sh"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(true);
	});

	it("does not match when shell argv0 is non-literal", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["$X"], { argvKinds: ["variable"], argv0Basename: "$X" });
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(false);
	});

	it("matches python interpreter as terminal", () => {
		const a = sc(["curl", "http://x"]);
		const b = sc(["python3"]);
		a.pipeNext = b;
		b.pipePrev = a;
		expect(curlPipeShell.match({ cwd: "/", simpleCommand: a, allCommands: [a, b] })).toBe(true);
	});
});
