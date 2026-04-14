import type { HandlerDefinition } from "../types.js";

const DOWNLOADERS = new Set(["curl", "wget", "fetch", "aria2c"]);
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

export const curlPipeShell: HandlerDefinition = {
	reason: "Piping a download directly into a shell is forbidden.",
	match: ({ simpleCommand }) => {
		if (!DOWNLOADERS.has(simpleCommand.argv0Basename)) return false;
		let node = simpleCommand.pipeNext;
		while (node) {
			if (node.argvKinds[0] === "literal" && SHELLS.has(node.argv0Basename)) return true;
			node = node.pipeNext;
		}
		return false;
	},
};
