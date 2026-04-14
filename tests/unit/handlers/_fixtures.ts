import type { SimpleCommand } from "../../../src/types.js";

export const sc = (argv: string[], overrides: Partial<SimpleCommand> = {}): SimpleCommand => ({
	argv,
	argvKinds: argv.map(() => "literal" as const),
	argv0Basename: argv[0]?.includes("/")
		? argv[0].slice(argv[0].lastIndexOf("/") + 1)
		: (argv[0] ?? ""),
	redirects: [],
	source: "top",
	raw: argv.join(" "),
	...overrides,
});
