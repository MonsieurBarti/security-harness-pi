import { describe, expect, it } from "vitest";
import {
	__registerHandlerForTests,
	getHandler,
	listHandlers,
} from "../../../src/handlers/index.js";
import type { HandlerDefinition } from "../../../src/types.js";

describe("handler registry — final", () => {
	const expected = [
		"force",
		"branch",
		"default-branch",
		"pkg-install",
		"pip-install",
		"cargo-add",
		"curl-pipe-shell",
		"reverse-shell",
		"escapes-project",
	];

	for (const name of expected) {
		it(`registers handler "${name}"`, () => {
			const h = getHandler(name);
			expect(h).toBeDefined();
			expect(typeof h?.match).toBe("function");
		});
	}

	it("listHandlers returns all 9 handlers", () => {
		const names = listHandlers();
		for (const n of expected) {
			expect(names).toContain(n);
		}
	});

	it("returns undefined for unknown handler", () => {
		expect(getHandler("does-not-exist")).toBeUndefined();
	});

	it("__registerHandlerForTests still works", () => {
		const fake: HandlerDefinition = { match: () => true };
		__registerHandlerForTests("__test_handler_p3_final", fake);
		expect(getHandler("__test_handler_p3_final")).toBe(fake);
	});
});
