import { beforeAll, describe, expect, it } from "vitest";
import { BashAnalyzer } from "../../../src/analyzers/bash-analyzer.js";

let analyzer: BashAnalyzer;

beforeAll(async () => {
	analyzer = await BashAnalyzer.create();
});

describe("BashAnalyzer — plain", () => {
	it("parses a single command with args", async () => {
		const r = await analyzer.analyze("rm -rf /tmp/foo");
		expect(r.parseError).toBeUndefined();
		expect(r.commands).toHaveLength(1);
		expect(r.commands[0]?.argv).toEqual(["rm", "-rf", "/tmp/foo"]);
	});

	it("captures raw source per command", async () => {
		const r = await analyzer.analyze("ls -la");
		expect(r.commands[0]?.raw).toBe("ls -la");
	});
});

describe("BashAnalyzer — concatenation", () => {
	it("joins concatenated single-quoted parts", async () => {
		const r = await analyzer.analyze("echo 'x''y'");
		expect(r.commands[0]?.argv).toEqual(["echo", "xy"]);
	});

	it("joins mixed-quote concatenations", async () => {
		const r = await analyzer.analyze("echo 'x'\"y\"");
		expect(r.commands[0]?.argv).toEqual(["echo", "xy"]);
	});
});

describe("BashAnalyzer — compound", () => {
	it("extracts both sides of a pipe", async () => {
		const r = await analyzer.analyze("cat file | grep foo");
		expect(r.commands).toHaveLength(2);
		expect(r.commands[0]?.argv).toEqual(["cat", "file"]);
		expect(r.commands[1]?.argv).toEqual(["grep", "foo"]);
		expect(r.commands[0]?.pipeNext).toBe(r.commands[1]);
		expect(r.commands[1]?.pipePrev).toBe(r.commands[0]);
	});

	it("extracts commands separated by &&", async () => {
		const r = await analyzer.analyze("ls && rm -rf /tmp/x");
		expect(r.commands).toHaveLength(2);
		expect(r.commands[1]?.argv).toEqual(["rm", "-rf", "/tmp/x"]);
	});

	it("extracts both commands from a semicolon-separated list", async () => {
		const r = await analyzer.analyze("echo a; echo b");
		expect(r.commands.map((c) => c.argv[0])).toEqual(["echo", "echo"]);
	});

	it("extracts commands separated by newlines", async () => {
		const r = await analyzer.analyze("rm a\nrm b");
		expect(r.commands).toHaveLength(2);
	});

	it("extracts inner commands from a subshell", async () => {
		const r = await analyzer.analyze("(cd /tmp && rm x)");
		expect(r.commands.map((c) => c.argv[0])).toEqual(["cd", "rm"]);
	});
});

describe("BashAnalyzer — nested", () => {
	it("descends into command substitution", async () => {
		const r = await analyzer.analyze('echo "$(rm -rf /tmp)"');
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("echo");
		expect(names).toContain("rm");
	});

	it("descends into backticks", async () => {
		const r = await analyzer.analyze("echo `rm -rf /tmp`");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("rm");
	});

	it("re-parses the string passed to bash -c", async () => {
		const r = await analyzer.analyze('bash -c "rm -rf /tmp/foo"');
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("bash");
		expect(names).toContain("rm");
	});

	it("re-parses the string passed to sh -c", async () => {
		const r = await analyzer.analyze("sh -c 'ls && rm -rf /tmp'");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});
});
