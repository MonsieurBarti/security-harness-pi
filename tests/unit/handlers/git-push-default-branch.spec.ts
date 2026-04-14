import { afterEach, describe, expect, it } from "vitest";
import {
	__resetResolvers,
	__setDefaultBranchResolver,
	__setHeadResolver,
	gitPushDefaultBranch,
} from "../../../src/handlers/git-push-default-branch.js";
import { sc } from "./_fixtures.js";

afterEach(() => __resetResolvers());

describe("gitPushDefaultBranch", () => {
	it("matches when pushing the default branch explicitly", () => {
		__setDefaultBranchResolver(() => "main");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "main"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("does not match when pushing a feature branch explicitly", () => {
		__setDefaultBranchResolver(() => "main");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "feature/x"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("matches bare git push when current HEAD is the default branch", () => {
		__setDefaultBranchResolver(() => "trunk");
		__setHeadResolver(() => "trunk");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("does not match bare git push when on a feature branch", () => {
		__setDefaultBranchResolver(() => "main");
		__setHeadResolver(() => "feature/x");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("matches git push <remote> when HEAD is default", () => {
		__setDefaultBranchResolver(() => "main");
		__setHeadResolver(() => "main");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("matches local:remote refspec where remote half is default", () => {
		__setDefaultBranchResolver(() => "main");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "local:main"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("fails closed when default-branch resolver throws", () => {
		__setDefaultBranchResolver(() => {
			throw new Error("no git");
		});
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push", "origin", "whatever"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("fails closed when HEAD resolver throws on bare push", () => {
		__setDefaultBranchResolver(() => "main");
		__setHeadResolver(() => {
			throw new Error("detached");
		});
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "push"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("does not match non-push git commands", () => {
		__setDefaultBranchResolver(() => "main");
		expect(
			gitPushDefaultBranch.match({
				cwd: "/",
				simpleCommand: sc(["git", "status"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
