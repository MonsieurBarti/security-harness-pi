import { PathAnalyzer } from "../analyzers/path-analyzer.js";
import type { HandlerDefinition } from "../types.js";

export const pathEscapesProject: HandlerDefinition = {
	reason: "Path escapes the project root.",
	match: ({ cwd, simpleCommand }) => {
		const p = simpleCommand.argv[0];
		if (!p) return false;
		return new PathAnalyzer(cwd).escapesProject(p);
	},
};
