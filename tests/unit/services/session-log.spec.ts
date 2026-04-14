import { describe, expect, it, vi } from "vitest";
import { SessionLog } from "../../../src/services/session-log.js";

describe("SessionLog", () => {
	it("records decisions with timestamp", () => {
		const appendEntry = vi.fn();
		const log = new SessionLog({ appendEntry });
		log.record({
			toolName: "bash",
			verdict: "forbid",
			ruleId: "forbid.test",
			input: "rm -rf /",
		});
		expect(appendEntry).toHaveBeenCalledTimes(1);
		const [channel, entry] = appendEntry.mock.calls[0] as [
			string,
			{ ts: string; toolName: string },
		];
		expect(channel).toBe("security-harness");
		expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(entry.toolName).toBe("bash");
	});

	it("recent() returns last n entries in insertion order", () => {
		const log = new SessionLog({ appendEntry: vi.fn() });
		for (let i = 0; i < 5; i++) {
			log.record({ toolName: "bash", verdict: "allow", input: String(i) });
		}
		const last3 = log.recent(3);
		expect(last3.map((e) => e.input)).toEqual(["2", "3", "4"]);
	});

	it("caps buffer at max", () => {
		const log = new SessionLog({ appendEntry: vi.fn() }, 3);
		for (let i = 0; i < 5; i++) {
			log.record({ toolName: "bash", verdict: "allow", input: String(i) });
		}
		expect(log.recent(100)).toHaveLength(3);
		expect(log.recent(100).map((e) => e.input)).toEqual(["2", "3", "4"]);
	});

	it("does not throw when appendEntry throws", () => {
		const log = new SessionLog({
			appendEntry: vi.fn(() => {
				throw new Error("pi gone");
			}),
		});
		expect(() => log.record({ toolName: "bash", verdict: "forbid", input: "x" })).not.toThrow();
		expect(log.recent(1)).toHaveLength(1);
	});
});
