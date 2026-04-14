import { execFileSync } from "node:child_process";
import type { HandlerDefinition } from "../types.js";

type Resolver = (cwd: string) => string;

const defaultBranchDefault: Resolver = (cwd) => {
	try {
		const out = execFileSync("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
		const slash = out.lastIndexOf("/");
		return slash >= 0 ? out.slice(slash + 1) : out;
	} catch {
		try {
			const out = execFileSync("git", ["config", "--get", "init.defaultBranch"], {
				cwd,
				stdio: ["ignore", "pipe", "ignore"],
			})
				.toString()
				.trim();
			return out || "main";
		} catch {
			return "main";
		}
	}
};

const headDefault: Resolver = (cwd) =>
	execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd,
		stdio: ["ignore", "pipe", "ignore"],
	})
		.toString()
		.trim();

let defaultBranchResolver: Resolver = defaultBranchDefault;
let headResolver: Resolver = headDefault;

export function __setDefaultBranchResolver(r: Resolver): void {
	defaultBranchResolver = r;
}
export function __setHeadResolver(r: Resolver): void {
	headResolver = r;
}
export function __resetResolvers(): void {
	defaultBranchResolver = defaultBranchDefault;
	headResolver = headDefault;
}

function looksLikeUrl(arg: string): boolean {
	return /^(https?:|git@|ssh:|file:|\/\/)/.test(arg);
}

export const gitPushDefaultBranch: HandlerDefinition = {
	reason: "Pushing to the default branch requires approval.",
	match: ({ simpleCommand, cwd }) => {
		if (simpleCommand.argv[0] !== "git" || simpleCommand.argv[1] !== "push") return false;

		let target: string;
		const positional = simpleCommand.argv
			.slice(2)
			.filter((a) => !a.startsWith("-") && !looksLikeUrl(a));

		if (positional.length >= 2) {
			const ref = positional[1] as string;
			target = ref.includes(":") ? (ref.split(":")[1] ?? ref) : ref;
		} else {
			// Bare `git push` OR `git push <remote>` — use current HEAD
			try {
				target = headResolver(cwd);
			} catch {
				return true;
			}
		}

		let defaultBranch: string;
		try {
			defaultBranch = defaultBranchResolver(cwd);
		} catch {
			return true;
		}

		return target === defaultBranch;
	},
};
