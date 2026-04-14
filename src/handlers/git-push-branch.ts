import picomatch from "picomatch";
import type { HandlerDefinition } from "../types.js";

function looksLikeUrl(arg: string): boolean {
	return /^(https?:|git@|ssh:|file:|\/\/)/.test(arg);
}

export const gitPushBranch: HandlerDefinition = {
	reason: "Pushing to a configured branch glob requires approval.",
	parseArgs: (argString) => {
		if (!argString) return [];
		return argString
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	},
	match: ({ simpleCommand, args }) => {
		if (simpleCommand.argv[0] !== "git" || simpleCommand.argv[1] !== "push") return false;
		const globs = Array.isArray(args) ? (args as string[]) : [];
		if (globs.length === 0) return false;

		// Find non-flag, non-URL-looking args in argv[2..]
		const positional = simpleCommand.argv
			.slice(2)
			.filter((a) => !a.startsWith("-") && !looksLikeUrl(a));
		let refspec: string | undefined;
		if (positional.length === 0) return false;
		if (positional.length === 1) refspec = positional[0];
		else refspec = positional[1];
		if (!refspec) return false;
		const branch = refspec.includes(":") ? (refspec.split(":")[1] ?? refspec) : refspec;

		const positive = globs.filter((g) => !g.startsWith("!"));
		const negative = globs.filter((g) => g.startsWith("!")).map((g) => g.slice(1));
		if (negative.length) {
			if (picomatch(negative)(branch)) return false;
			if (positive.length === 0) return true;
		}
		return positive.length ? picomatch(positive)(branch) : false;
	},
};
