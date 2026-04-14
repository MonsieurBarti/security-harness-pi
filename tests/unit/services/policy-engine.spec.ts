import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BashAnalyzer } from "../../../src/analyzers/bash-analyzer.js";
import { DEFAULT_ASK, DEFAULT_FORBID } from "../../../src/defaults.js";
import {
	__resetResolvers,
	__setDefaultBranchResolver,
} from "../../../src/handlers/git-push-default-branch.js";
import { PolicyEngine } from "../../../src/services/policy-engine.js";

let analyzer: BashAnalyzer;
beforeAll(async () => {
	analyzer = await BashAnalyzer.create();
});

afterEach(() => __resetResolvers());

const makeEngine = (mode: "enforce" | "warn" = "enforce") =>
	new PolicyEngine({
		enabled: true,
		mode,
		forbiddenRules: DEFAULT_FORBID,
		askRules: DEFAULT_ASK,
		warnings: [],
		sources: { defaults: true },
	});

describe("PolicyEngine.classifyBash", () => {
	it("forbids sudo", async () => {
		const a = analyzer.analyze("sudo ls");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("forbid");
	});

	it("forbids rm -rf /", async () => {
		const a = analyzer.analyze("rm -rf /");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("forbid");
	});

	it("forbids nested rm -rf inside $()", async () => {
		const a = analyzer.analyze("echo $(rm -rf /)");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("forbid");
	});

	it("forbids on parse error with rule id forbid.parse-error", async () => {
		const a = analyzer.analyze("rm 'unterminated");
		const v = makeEngine().classifyBash(a, "/proj");
		expect(v.action).toBe("forbid");
		expect(v.ruleId).toBe("forbid.parse-error");
	});

	it("asks git push to default branch", async () => {
		__setDefaultBranchResolver(() => "main");
		const a = analyzer.analyze("git push origin main");
		const v = makeEngine().classifyBash(a, "/proj");
		expect(v.action).toBe("ask");
		expect(v.ruleId).toBe("ask.git-push-default");
	});

	it("allows git push to feature branch", async () => {
		__setDefaultBranchResolver(() => "main");
		const a = analyzer.analyze("git push origin feature/x");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("allow");
	});

	it("allows bare npm install", async () => {
		const a = analyzer.analyze("npm install");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("allow");
	});

	it("asks npm install react", async () => {
		const a = analyzer.analyze("npm install react");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("ask");
	});

	it("forbid wins over ask", async () => {
		const a = analyzer.analyze("$X something && git merge");
		expect(makeEngine().classifyBash(a, "/proj").action).toBe("forbid");
	});
});

describe("PolicyEngine.classifyPath", () => {
	const engine = makeEngine();

	it("asks write to .env", () => {
		expect(engine.classifyPath("write", ".env", "/proj").action).toBe("ask");
	});
	it("asks read of secret", () => {
		expect(engine.classifyPath("read", "src/secrets/token", "/proj").action).toBe("ask");
	});
	it("forbids write to /etc/hosts", () => {
		expect(engine.classifyPath("write", "/etc/hosts", "/proj").action).toBe("forbid");
	});
	it("allows read of normal file", () => {
		expect(engine.classifyPath("read", "src/app.ts", "/proj").action).toBe("allow");
	});
	it("edit maps to path-write kind", () => {
		expect(engine.classifyPath("edit", ".env", "/proj").action).toBe("ask");
	});
});

describe("PolicyEngine — warn mode", () => {
	it("returns allow with ruleId for what would have been forbidden", async () => {
		const engine = makeEngine("warn");
		const a = analyzer.analyze("sudo rm -rf /");
		const v = engine.classifyBash(a, "/proj");
		expect(v.action).toBe("allow");
		expect(v.ruleId).toBeDefined();
	});
});

describe("PolicyEngine — negation", () => {
	it("negate flips a forbid rule so it becomes an allow exception", async () => {
		const negateRule = {
			id: "forbid.test-negate",
			description: "negated test",
			kind: "bash" as const,
			severity: "forbid" as const,
			match: { argv0: "echo" },
			negate: true,
		};
		const engine = new PolicyEngine({
			enabled: true,
			mode: "enforce",
			forbiddenRules: [negateRule],
			askRules: [],
			warnings: [],
			sources: { defaults: true },
		});
		const echo = analyzer.analyze("echo hi");
		expect(engine.classifyBash(echo, "/proj").action).toBe("allow");
		const ls = analyzer.analyze("ls");
		expect(engine.classifyBash(ls, "/proj").action).toBe("forbid");
	});
});
