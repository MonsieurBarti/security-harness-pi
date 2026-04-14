import { describe, expect, it } from "vitest";
import { gitPushForce } from "../../../src/handlers/git-push-force.js";
import { sc } from "./_fixtures.js";

describe("gitPushForce", () => {
	it("matches --force", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "--force"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches -f", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "-f", "origin"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches --force-with-lease", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "--force-with-lease"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches --force-with-lease=<refname>", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "--force-with-lease=main"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match plain push", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "main"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match non-push git commands", () => {
		expect(
			gitPushForce.match({ cwd: "/", simpleCommand: sc(["git", "status"]), allCommands: [] }),
		).toBe(false);
	});
	it("does not match non-git commands", () => {
		expect(
			gitPushForce.match({
				cwd: "/",
				simpleCommand: sc(["docker", "push", "--force"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
