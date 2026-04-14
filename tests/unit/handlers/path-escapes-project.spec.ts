import { describe, expect, it } from "vitest";
import { pathEscapesProject } from "../../../src/handlers/path-escapes-project.js";
import { sc } from "./_fixtures.js";

describe("pathEscapesProject", () => {
	it("fires for ../../etc/passwd", () => {
		expect(
			pathEscapesProject.match({
				cwd: "/proj",
				simpleCommand: sc(["../../etc/passwd"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("does not fire for project-relative", () => {
		expect(
			pathEscapesProject.match({
				cwd: "/proj",
				simpleCommand: sc(["src/a.ts"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("fires for absolute path outside project", () => {
		expect(
			pathEscapesProject.match({
				cwd: "/proj",
				simpleCommand: sc(["/etc/hosts"]),
				allCommands: [],
			}),
		).toBe(true);
	});

	it("does not fire for absolute path inside project", () => {
		expect(
			pathEscapesProject.match({
				cwd: "/proj",
				simpleCommand: sc(["/proj/src/a.ts"]),
				allCommands: [],
			}),
		).toBe(false);
	});

	it("returns false for missing path", () => {
		expect(
			pathEscapesProject.match({
				cwd: "/proj",
				simpleCommand: sc([]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
