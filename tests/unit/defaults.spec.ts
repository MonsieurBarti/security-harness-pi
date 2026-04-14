import { describe, expect, it } from "vitest";
import { DEFAULT_ASK, DEFAULT_FORBID } from "../../src/defaults.js";
import { getHandler } from "../../src/handlers/index.js";

describe("DEFAULT_FORBID", () => {
	it("every rule id starts with 'forbid.' and is unique", () => {
		const ids = new Set<string>();
		for (const r of DEFAULT_FORBID) {
			expect(r.id).toMatch(/^forbid\./);
			expect(r.severity).toBe("forbid");
			expect(ids.has(r.id)).toBe(false);
			ids.add(r.id);
			expect(r.description).toBeTruthy();
		}
	});

	it("every rule with a custom handler references an existing handler", () => {
		for (const r of DEFAULT_FORBID) {
			if (r.match?.custom) expect(getHandler(r.match.custom)).toBeDefined();
		}
	});

	it("ships the must-have forbid rules", () => {
		const ids = DEFAULT_FORBID.map((r) => r.id);
		const required = [
			"forbid.privilege-escalation",
			"forbid.rm-rf-root",
			"forbid.dd-device",
			"forbid.mkfs",
			"forbid.fork-bomb",
			"forbid.curl-pipe-shell",
			"forbid.reverse-shell",
			"forbid.variable-argv0",
			"forbid.credential-read",
			"forbid.system-write",
			"forbid.path-escape-write",
			"forbid.eval",
		];
		for (const id of required) expect(ids).toContain(id);
	});
});

describe("DEFAULT_ASK", () => {
	it("every rule id starts with 'ask.' and is unique", () => {
		const ids = new Set<string>();
		for (const r of DEFAULT_ASK) {
			expect(r.id).toMatch(/^ask\./);
			expect(r.severity).toBe("ask");
			expect(ids.has(r.id)).toBe(false);
			ids.add(r.id);
			expect(r.description).toBeTruthy();
		}
	});

	it("every rule with a custom handler references an existing handler", () => {
		for (const r of DEFAULT_ASK) {
			if (r.match?.custom) expect(getHandler(r.match.custom)).toBeDefined();
		}
	});

	it("ships the must-have ask rules", () => {
		const ids = DEFAULT_ASK.map((r) => r.id);
		const required = [
			"ask.rm-rf",
			"ask.git-push-default",
			"ask.git-push-force",
			"ask.git-merge",
			"ask.git-destructive",
			"ask.pkg-publish",
			"ask.pkg-install-new",
			"ask.pip-install-new",
			"ask.cargo-add",
			"ask.sensitive-write",
			"ask.sensitive-read",
			"ask.mass-delete",
			"ask.net-download-exec",
			"ask.dynamic-interpreter",
			"ask.path-manip",
		];
		for (const id of required) expect(ids).toContain(id);
	});
});
