import { describe, expect, it } from "vitest";
import { cargoAdd } from "../../../src/handlers/cargo-add.js";
import { sc } from "./_fixtures.js";

describe("cargoAdd", () => {
	it("matches cargo add serde", () => {
		expect(
			cargoAdd.match({ cwd: "/", simpleCommand: sc(["cargo", "add", "serde"]), allCommands: [] }),
		).toBe(true);
	});
	it("does not match cargo add --dry-run serde", () => {
		expect(
			cargoAdd.match({
				cwd: "/",
				simpleCommand: sc(["cargo", "add", "--dry-run", "serde"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match bare cargo add", () => {
		expect(cargoAdd.match({ cwd: "/", simpleCommand: sc(["cargo", "add"]), allCommands: [] })).toBe(
			false,
		);
	});
	it("does not match cargo build", () => {
		expect(
			cargoAdd.match({ cwd: "/", simpleCommand: sc(["cargo", "build"]), allCommands: [] }),
		).toBe(false);
	});
});
