import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ASK, DEFAULT_FORBID } from "../../../src/defaults.js";
import { loadConfig } from "../../../src/services/config-loader.js";

let tmp: string;

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "sh-conf-"));
});

describe("loadConfig", () => {
	it("uses defaults only when no files exist", async () => {
		const r = await loadConfig({ cwd: tmp, globalDir: join(tmp, "no-global") });
		expect(r.forbiddenRules.length).toBe(DEFAULT_FORBID.length);
		expect(r.askRules.length).toBe(DEFAULT_ASK.length);
		expect(r.warnings).toEqual([]);
		expect(r.sources).toEqual({ defaults: true });
		expect(r.enabled).toBe(true);
		expect(r.mode).toBe("enforce");
	});

	it("global extend adds to defaults", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		writeFileSync(
			join(g, "security-harness.json"),
			JSON.stringify({ forbid: ["Bash(yolo:*)"], ask: ["Bash(maybe:*)"] }),
		);
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		expect(r.forbiddenRules.some((x) => x.description === "Bash(yolo:*)")).toBe(true);
		expect(r.askRules.some((x) => x.description === "Bash(maybe:*)")).toBe(true);
		expect(r.sources.global).toContain("security-harness.json");
	});

	it("global disable removes a default by id", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		writeFileSync(
			join(g, "security-harness.json"),
			JSON.stringify({ disable: ["default:forbid.eval"] }),
		);
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		expect(r.forbiddenRules.some((x) => x.id === "forbid.eval")).toBe(false);
	});

	it("project disable is ignored with warning", async () => {
		const proj = join(tmp, ".pi");
		mkdirSync(proj, { recursive: true });
		writeFileSync(
			join(proj, "security-harness.json"),
			JSON.stringify({ disable: ["default:forbid.eval"] }),
		);
		const r = await loadConfig({ cwd: tmp, globalDir: join(tmp, "no-global") });
		expect(r.forbiddenRules.some((x) => x.id === "forbid.eval")).toBe(true);
		expect(r.warnings.some((w) => w.includes("project-level disable"))).toBe(true);
	});

	it("project extend adds rules", async () => {
		const proj = join(tmp, ".pi");
		mkdirSync(proj, { recursive: true });
		writeFileSync(
			join(proj, "security-harness.json"),
			JSON.stringify({ ask: ["Bash(docker system prune:*)"] }),
		);
		const r = await loadConfig({ cwd: tmp, globalDir: join(tmp, "no-global") });
		expect(r.askRules.some((x) => x.description === "Bash(docker system prune:*)")).toBe(true);
		expect(r.sources.project).toContain("security-harness.json");
	});

	it("global malformed JSON surfaces warning and falls back to defaults", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		writeFileSync(join(g, "security-harness.json"), "{ not json");
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		expect(r.forbiddenRules.length).toBe(DEFAULT_FORBID.length);
		expect(r.warnings.some((w) => w.toLowerCase().includes("parse"))).toBe(true);
	});

	it("bad pattern string generates a warning and the rule is skipped", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		writeFileSync(join(g, "security-harness.json"), JSON.stringify({ forbid: ["Bash("] }));
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		expect(r.forbiddenRules.length).toBe(DEFAULT_FORBID.length);
		expect(r.warnings.some((w) => w.toLowerCase().includes("bad pattern"))).toBe(true);
	});

	it("de-duplicates by id — later wins", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		const override = {
			id: "forbid.eval",
			description: "Override eval",
			kind: "bash",
			severity: "forbid",
			match: { argv0: "eval-custom" },
		};
		writeFileSync(join(g, "security-harness.json"), JSON.stringify({ rules: [override] }));
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		const evalRule = r.forbiddenRules.find((x) => x.id === "forbid.eval");
		expect(evalRule?.description).toBe("Override eval");
	});

	it("respects enabled=false and mode=warn from config", async () => {
		const g = join(tmp, "g");
		mkdirSync(g, { recursive: true });
		writeFileSync(
			join(g, "security-harness.json"),
			JSON.stringify({ enabled: false, mode: "warn" }),
		);
		const r = await loadConfig({ cwd: tmp, globalDir: g });
		expect(r.enabled).toBe(false);
		expect(r.mode).toBe("warn");
	});
});
