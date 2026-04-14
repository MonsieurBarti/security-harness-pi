import type { HandlerDefinition } from "../types.js";

export const gitPushForce: HandlerDefinition = {
	reason: "Force push requires approval.",
	match: ({ simpleCommand }) => {
		if (simpleCommand.argv[0] !== "git" || simpleCommand.argv[1] !== "push") return false;
		return simpleCommand.argv
			.slice(2)
			.some((a) => a === "-f" || a === "--force" || a.startsWith("--force-with-lease"));
	},
};
