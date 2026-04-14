import { describe, expect, it } from "vitest";
import { PathAnalyzer } from "../../../src/analyzers/path-analyzer.js";

describe("PathAnalyzer", () => {
	const pa = new PathAnalyzer("/home/u/proj");

	it("resolves relative to project root", () => {
		expect(pa.resolve("src/a.ts")).toBe("/home/u/proj/src/a.ts");
	});

	it("expands tilde to home", () => {
		const home = process.env.HOME ?? "/home/u";
		expect(pa.resolve("~/.ssh/id_rsa")).toBe(`${home}/.ssh/id_rsa`);
	});

	it("detects path escaping the project root", () => {
		expect(pa.escapesProject("../../etc/passwd")).toBe(true);
		expect(pa.escapesProject("src/a.ts")).toBe(false);
	});

	it("matches a glob pattern", () => {
		expect(pa.matches("src/secret.env", [".env*", "**/secret*"])).toBe(true);
		expect(pa.matches("src/app.ts", [".env*"])).toBe(false);
	});

	it("tilde-expands glob patterns", () => {
		const home = process.env.HOME ?? "/home/u";
		expect(pa.matches(`${home}/.ssh/id_rsa`, ["~/.ssh/id_*"])).toBe(true);
	});
});
