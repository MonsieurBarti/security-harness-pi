import { describe, expect, it } from "vitest";
import { npmInstallWithPkg } from "../../../src/handlers/npm-install-with-pkg.js";
import { sc } from "./_fixtures.js";

describe("npmInstallWithPkg", () => {
	it("matches npm install react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches npm i react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "i", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare npm install", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["npm", "install"]), allCommands: [] }),
		).toBe(false);
	});
	it("does not match npm install --save-dev (no positional)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "--save-dev"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("matches yarn add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["yarn", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches pnpm add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pnpm", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches bun add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["bun", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches npm install --save-dev react (mixed flags + positional)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "--save-dev", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches /usr/bin/npm install react via argv0Basename", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["/usr/bin/npm", "install", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match unknown subcommand", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["npm", "ci"]), allCommands: [] }),
		).toBe(false);
	});
});
