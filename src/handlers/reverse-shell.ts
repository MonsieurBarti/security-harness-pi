import type { HandlerDefinition } from "../types.js";

const DEV_NET_RE = /\/dev\/(tcp|udp)\//;

export const reverseShell: HandlerDefinition = {
	reason: "Reverse-shell pattern detected.",
	match: ({ simpleCommand }) => {
		if (simpleCommand.redirects.some((r) => DEV_NET_RE.test(r.target))) return true;

		const tool = simpleCommand.argv0Basename;
		if (tool === "nc" || tool === "ncat") {
			const args = simpleCommand.argv.slice(1);
			if (args.includes("-e") || args.includes("--exec")) return true;
			if (args.includes("-l") || args.includes("--listen")) return true;
		}
		return false;
	},
};
