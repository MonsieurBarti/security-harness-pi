import { describe, expect, it } from "vitest";
import { pipInstallWithPkg } from "../../../src/handlers/pip-install-with-pkg.js";
import { sc } from "./_fixtures.js";

describe("pipInstallWithPkg", () => {
	it("matches pip install flask", () => {
		expect(
			pipInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pip", "install", "flask"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches pip3 install flask", () => {
		expect(
			pipInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pip3", "install", "flask"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match pip install -r requirements.txt", () => {
		expect(
			pipInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pip", "install", "-r", "requirements.txt"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match pip install -e .", () => {
		expect(
			pipInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pip", "install", "-e", "."]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match bare pip install", () => {
		expect(
			pipInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["pip", "install"]), allCommands: [] }),
		).toBe(false);
	});
	it("does not match pip uninstall flask", () => {
		expect(
			pipInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pip", "uninstall", "flask"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
