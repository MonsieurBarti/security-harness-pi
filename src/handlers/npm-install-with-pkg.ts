import type { HandlerDefinition } from "../types.js";

/**
 * Ecosystem-wide package install detection.
 * Named npm-install-with-pkg for historical reasons — now covers npm, yarn, pnpm,
 * bun, cargo, brew, go, gem, composer, poetry, uv, and deno.
 */
const INSTALL_SUBCMDS: Record<string, string[]> = {
	npm: ["install", "i", "add"],
	yarn: ["add"],
	pnpm: ["add", "install", "i"],
	bun: ["add", "install", "i"],
	cargo: ["install"],
	brew: ["install"],
	go: ["install"],
	gem: ["install"],
	composer: ["require"],
	poetry: ["add"],
	uv: ["add"],
	deno: ["install", "add"],
};

export const npmInstallWithPkg: HandlerDefinition = {
	reason: "Adding a new dependency requires approval.",
	match: ({ simpleCommand }) => {
		const tool = simpleCommand.argv0Basename;
		if (!tool) return false;

		// Special case: uv pip install <pkg> (3-level subcommand)
		if (tool === "uv" && simpleCommand.argv[1] === "pip" && simpleCommand.argv[2] === "install") {
			return simpleCommand.argv.slice(3).some((a) => !a.startsWith("-"));
		}

		const sub = simpleCommand.argv[1];
		if (!sub) return false;
		const subs = INSTALL_SUBCMDS[tool];
		if (!subs || !subs.includes(sub)) return false;
		return simpleCommand.argv.slice(2).some((a) => !a.startsWith("-"));
	},
};
