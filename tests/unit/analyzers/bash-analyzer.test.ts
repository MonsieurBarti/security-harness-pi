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
