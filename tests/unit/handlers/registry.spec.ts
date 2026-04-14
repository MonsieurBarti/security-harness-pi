import { describe, expect, it } from "vitest";
import {
	__registerHandlerForTests,
	getHandler,
	listHandlers,
} from "../../../src/handlers/index.js";
import type { HandlerDefinition } from "../../../src/types.js";

describe("handler registry", () => {
	it("returns undefined for unknown handler", () => {
		expect(getHandler("does-not-exist")).toBeUndefined();
	});

	it("listHandlers returns an array", () => {
		expect(Array.isArray(listHandlers())).toBe(true);
	});

	it("test-only registration helper works for downstream tests", () => {
		const fake: HandlerDefinition = { match: () => true };
		__registerHandlerForTests("__test_handler", fake);
		expect(getHandler("__test_handler")).toBe(fake);
	});
});
