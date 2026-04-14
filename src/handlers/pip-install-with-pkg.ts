import type { HandlerDefinition } from "../types.js";

export const pipInstallWithPkg: HandlerDefinition = {
	reason: "pip install of a package requires approval.",
	match: ({ simpleCommand }) => {
		const tool = simpleCommand.argv0Basename;
		if (tool !== "pip" && tool !== "pip3") return false;
		if (simpleCommand.argv[1] !== "install") return false;
		const rest = simpleCommand.argv.slice(2);
		if (rest.includes("-r") || rest.includes("--requirement")) return false;
		if (rest.includes("-e") || rest.includes("--editable")) return false;
		return rest.some((a) => !a.startsWith("-"));
	},
};
