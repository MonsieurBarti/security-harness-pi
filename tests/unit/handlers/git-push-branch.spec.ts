import { describe, expect, it } from "vitest";
import { gitPushBranch } from "../../../src/handlers/git-push-branch.js";
import { sc } from "./_fixtures.js";

describe("gitPushBranch — parseArgs", () => {
	it("splits comma-separated globs and trims", () => {
		expect(gitPushBranch.parseArgs?.("release/*, hotfix/*")).toEqual(["release/*", "hotfix/*"]);
	});
	it("returns [] for empty/undefined", () => {
		expect(gitPushBranch.parseArgs?.(undefined)).toEqual([]);
		expect(gitPushBranch.parseArgs?.("")).toEqual([]);
	});
});

describe("gitPushBranch — match", () => {
	it("matches positive glob", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "release/1.0"]),
				allCommands: [],
				args: ["release/*"],
			}),
		).toBe(true);
	});
	it("does not match feature when only release allowed", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "feature/x"]),
				allCommands: [],
				args: ["release/*"],
			}),
		).toBe(false);
	});
	it("negation: ! prefix excludes match", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "feature/x"]),
				allCommands: [],
				args: ["!feature/*"],
			}),
		).toBe(false);
	});
	it("negation-only: returns true when not excluded", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "main"]),
				allCommands: [],
				args: ["!feature/*"],
			}),
		).toBe(true);
	});
	it("local:remote refspec matches against remote half", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "local-branch:release/2.0"]),
				allCommands: [],
				args: ["release/*"],
			}),
		).toBe(true);
	});
	it("returns false when no positional refspec", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push"]),
				allCommands: [],
				args: ["release/*"],
			}),
		).toBe(false);
	});
	it("skips URL-looking args (https://...)", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "https://github.com/x/y.git", "main"]),
				allCommands: [],
				args: ["main"],
			}),
		).toBe(true);
	});
	it("skips git@ URL args", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "git@github.com:x/y.git", "main"]),
				allCommands: [],
				args: ["main"],
			}),
		).toBe(true);
	});
	it("returns false when args is empty (no globs configured)", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "main"]),
				allCommands: [],
				args: [],
			}),
		).toBe(false);
	});
	it("does not match non-push git commands", () => {
		expect(
			gitPushBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "status"]),
				allCommands: [],
				args: ["main"],
			}),
		).toBe(false);
	});
});
