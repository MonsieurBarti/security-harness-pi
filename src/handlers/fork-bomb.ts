import type { HandlerDefinition } from "../types.js";

export const forkBomb: HandlerDefinition = {
	reason: "Fork bomb pattern detected.",
	match: ({ allCommands }) => {
		// :(){ :|:& };: produces multiple bare `:` simple-commands from tree-sitter parsing.
		// Any command set of 3+ bare `:` is overwhelmingly likely to be a fork bomb.
		if (allCommands.length < 3) return false;
		return allCommands.every((c) => c.argv[0] === ":");
	},
};
