import type { HandlerDefinition, SimpleCommand } from "../types.js";

const SHELLS = new Set([
	"sh",
	"bash",
	"zsh",
	"dash",
	"ksh",
	"python",
	"python3",
	"node",
	"perl",
	"ruby",
]);

export const pipeToShell: HandlerDefinition = {
	reason: "Piping into a shell interpreter requires approval.",
	match: ({ simpleCommand }) => {
		// Don't fire on shells themselves (avoid sh->bash false positive)
		if (SHELLS.has(simpleCommand.argv0Basename)) return false;

		let node: SimpleCommand | undefined = simpleCommand.pipeNext;
		while (node) {
			if (node.argvKinds[0] === "literal" && SHELLS.has(node.argv0Basename)) return true;
			node = node.pipeNext;
		}
		return false;
	},
};
