import { describe, expect, it } from "vitest";
import { bashFileEscape } from "../../../src/handlers/bash-file-escape.js";
import type { FileArgSpec, ResolvedConfig } from "../../../src/types.js";
import { sc } from "./_fixtures.js";

const baseConfig: ResolvedConfig = {
	enabled: true,
	mode: "enforce",
	forbiddenRules: [],
	askRules: [],
	warnings: [],
	sources: { defaults: true },
	bashFileSignatures: [],
};

function makeCtx(
	cwd: string,
	argv: string[],
	redirects: { op: string; target: string }[] = [],
	config: ResolvedConfig = baseConfig,
) {
	return {
		cwd,
		simpleCommand: sc(argv, { redirects }),
		allCommands: [],
		config,
	};
}

describe("bashFileEscape", () => {
	describe("redirects (any command)", () => {
		it("fires for output redirect to external path", () => {
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["echo", "evil"], [{ op: ">", target: "~/.pi/agent/models.json" }]),
				),
			).toBe(true);
		});

		it("fires for append redirect to external path", () => {
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["echo", "evil"], [{ op: ">>", target: "/etc/passwd" }]),
				),
			).toBe(true);
		});

		it("does NOT fire for redirect inside project", () => {
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["echo", "hello"], [{ op: ">", target: "output.txt" }]),
				),
			).toBe(false);
		});

		it("does NOT fire for input redirect (read-only)", () => {
			expect(
				bashFileEscape.match(makeCtx("/proj", ["cat"], [{ op: "<", target: "/etc/passwd" }])),
			).toBe(false);
		});

		it("does NOT fire for redirect to file descriptor", () => {
			expect(
				bashFileEscape.match(makeCtx("/proj", ["echo", "hello"], [{ op: "2>&1", target: "1" }])),
			).toBe(false);
		});
	});

	describe("sed (last-positional)", () => {
		it("fires for the exact bypass: sed -i '' 's|a|b|' ~/.pi/agent/models.json", () => {
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["sed", "-i", "''", "'s|a|b|'", "~/.pi/agent/models.json"]),
				),
			).toBe(true);
		});

		it("fires for sed with GNU-style -i.bak", () => {
			expect(
				bashFileEscape.match(makeCtx("/proj", ["sed", "-i.bak", "'s|a|b|'", "/etc/hosts"])),
			).toBe(true);
		});

		it("does NOT fire for sed editing a project file", () => {
			expect(
				bashFileEscape.match(makeCtx("/proj", ["sed", "-i", "''", "'s|a|b|'", "src/main.ts"])),
			).toBe(false);
		});

		it("does NOT fire for sed with variable-expanded path", () => {
			// Variable expansion is a known limitation; the path doesn't look like a literal
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["sed", "-i", "''", "'s|a|b|'", '"$HOME/.pi/agent/models.json"']),
				),
			).toBe(false);
		});
	});

	describe("cp (all-positional)", () => {
		it("fires for cp from external to project", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["cp", "/etc/passwd", "."]))).toBe(true);
		});

		it("fires for cp from project to external", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["cp", "file.txt", "/tmp/"]))).toBe(true);
		});

		it("does NOT fire for cp inside project", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["cp", "src/a.ts", "dist/a.ts"]))).toBe(false);
		});
	});

	describe("mv (all-positional)", () => {
		it("fires for mv to external", () => {
			expect(
				bashFileEscape.match(makeCtx("/proj", ["mv", "file.txt", "~/.pi/agent/models.json"])),
			).toBe(true);
		});

		it("does NOT fire for mv inside project", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["mv", "src/a.ts", "src/b.ts"]))).toBe(false);
		});
	});

	describe("tee (all-positional)", () => {
		it("fires for tee writing to external", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["tee", "/etc/hosts"]))).toBe(true);
		});

		it("does NOT fire for tee inside project", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["tee", "log.txt"]))).toBe(false);
		});
	});

	describe("touch (all-positional)", () => {
		it("fires for touch on external path", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["touch", "/etc/newfile"]))).toBe(true);
		});

		it("does NOT fire for touch with no args", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["touch"]))).toBe(false);
		});
	});

	describe("non-signature commands", () => {
		it("does NOT fire for cat even with external arg", () => {
			// cat is not in the signature list; only redirects would catch it
			expect(bashFileEscape.match(makeCtx("/proj", ["cat", "/etc/passwd"]))).toBe(false);
		});

		it("does NOT fire for ls with external path", () => {
			expect(bashFileEscape.match(makeCtx("/proj", ["ls", "/usr/bin"]))).toBe(false);
		});
	});

	describe("config extensions", () => {
		it("fires for a user-added signature command", () => {
			const customSig: FileArgSpec = {
				command: "mktemp",
				fileArgs: { type: "last-positional", count: 1 },
			};
			const cfg: ResolvedConfig = { ...baseConfig, bashFileSignatures: [customSig] };
			expect(bashFileEscape.match(makeCtx("/proj", ["mktemp", "/tmp/XXXXXX"], [], cfg))).toBe(true);
		});

		it("config override takes precedence over built-in", () => {
			// Override sed to check ALL positional args instead of just last
			const override: FileArgSpec = {
				command: "sed",
				fileArgs: { type: "all-positional" },
			};
			const cfg: ResolvedConfig = { ...baseConfig, bashFileSignatures: [override] };
			// With all-positional, even a script arg like 's|/foo|/bar|g' that contains /
			// would be checked — but it doesn't escape /proj. The external file arg
			// still escapes.
			expect(
				bashFileEscape.match(
					makeCtx("/proj", ["sed", "-i", "''", "'s|/foo|/bar|g'", "/etc/hosts"], [], cfg),
				),
			).toBe(true);
		});
	});
});
