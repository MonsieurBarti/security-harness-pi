import type { HandlerDefinition } from "../types.js";

const INSTALL_SUBCMDS: Record<string, string[]> = {
	npm: ["install", "i", "add"],
	yarn: ["add"],
	pnpm: ["add", "install", "i"],
	bun: ["add"],
};

export const npmInstallWithPkg: HandlerDefinition = {
	reason: "Adding a new dependency requires approval.",
	match: ({ simpleCommand }) => {
		const tool = simpleCommand.argv0Basename;
		const sub = simpleCommand.argv[1];
		if (!tool || !sub) return false;
		const subs = INSTALL_SUBCMDS[tool];
		if (!subs || !subs.includes(sub)) return false;
		return simpleCommand.argv.slice(2).some((a) => !a.startsWith("-"));
	},
};
