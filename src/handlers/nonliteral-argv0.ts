import type { HandlerDefinition } from "../types.js";

export const nonliteralArgv0: HandlerDefinition = {
	reason: "Program name is not a literal — cannot be statically verified.",
	match: ({ simpleCommand }) => {
		const kind = simpleCommand.argvKinds[0];
		return kind === "variable" || kind === "substitution" || kind === "process-substitution";
	},
};
