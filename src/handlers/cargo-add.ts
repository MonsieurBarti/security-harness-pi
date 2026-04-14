import type { HandlerDefinition } from "../types.js";

export const cargoAdd: HandlerDefinition = {
	reason: "cargo add requires approval.",
	match: ({ simpleCommand }) => {
		if (simpleCommand.argv0Basename !== "cargo" || simpleCommand.argv[1] !== "add") return false;
		if (simpleCommand.argv.includes("--dry-run")) return false;
		return simpleCommand.argv.slice(2).some((a) => !a.startsWith("-"));
	},
};
