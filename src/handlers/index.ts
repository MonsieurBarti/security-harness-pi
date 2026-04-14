import type { HandlerDefinition } from "../types.js";

const registry: Record<string, HandlerDefinition> = {};

export function getHandler(name: string): HandlerDefinition | undefined {
	return registry[name];
}

export function listHandlers(): string[] {
	return Object.keys(registry);
}

/**
 * Test-only: install a handler at runtime. Used by pattern-parser tests
 * to verify handler integration without depending on Phase 3 implementations.
 * Do NOT call from production code.
 */
export function __registerHandlerForTests(name: string, def: HandlerDefinition): void {
	registry[name] = def;
}
