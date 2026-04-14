export type Severity = "forbid" | "ask";

export type RuleKind = "bash" | "path-write" | "path-read";

export interface Match {
	argv0?: string | string[];
	argvAny?: string[];
	argvAll?: string[];
	argvExact?: boolean; // when true, argv length must equal 1 + (argvAll?.length ?? 0)
	argvPattern?: string;
	redirectsTo?: string[];
	pipedFrom?: string[];
	pipedInto?: string[];
	custom?: string;
	customArgs?: unknown;
	requiresPositional?: boolean;
}

export interface Rule {
	id: string;
	description: string;
	kind: RuleKind;
	match?: Match;
	paths?: string[];
	severity: Severity;
	reason?: string;
	negate?: boolean;
}

export interface Redirect {
	op: string; // the literal redirect operator as it appears in source (">", ">>", "2>&1", ">&", etc.)
	target: string;
}

// Discriminator for individual argv tokens.
export type ArgvKind = "literal" | "variable" | "substitution" | "process-substitution";

// Where a SimpleCommand was extracted from. Drives later policy decisions
// (e.g. eval'd commands cannot be statically trusted).
export type CommandSource =
	| "top" // direct from the original command string
	| "subshell" // inside (...) or { ...; }
	| "shell-c" // inside `bash -c "..."` etc.
	| "eval" // inside `eval "..."`
	| "substitution" // inside `$(...)` or backticks
	| "process-substitution" // inside `<(...)` or `>(...)`
	| "wrapper"; // inner command extracted from a transparent wrapper (env, xargs, timeout, …)

export interface SimpleCommand {
	argv: string[];
	argvKinds: ArgvKind[]; // parallel to argv. argvKinds[i] tags the *origin shape* of argv[i].
	// For `$X`/`${FOO}` → "variable"; `$(...)`/backticks → "substitution"; literal/word → "literal".
	argv0Basename: string; // basename(argv[0]) when argv[0] is a literal containing "/"; else equal to argv[0].
	// Use this for matching `Bash(rm:*)` against `/bin/rm`.
	redirects: Redirect[];
	pipeNext?: SimpleCommand | undefined;
	pipePrev?: SimpleCommand | undefined;
	source: CommandSource;
	raw: string;
}

export interface BashAnalysis {
	commands: SimpleCommand[];
	parseError?: string;
}

export type VerdictAction = "allow" | "ask" | "forbid";

export interface Verdict {
	action: VerdictAction;
	ruleId?: string;
	reason?: string;
	description?: string;
}

export interface Config {
	enabled: boolean;
	mode: "enforce" | "warn";
	forbid: (string | Rule)[];
	ask: (string | Rule)[];
	disable: string[];
	rules: Rule[];
}

export interface ResolvedConfig {
	enabled: boolean;
	mode: "enforce" | "warn";
	forbiddenRules: Rule[];
	askRules: Rule[];
	warnings: string[];
	sources: { defaults: true; global?: string; project?: string };
}

export interface HandlerCtx {
	cwd: string;
	simpleCommand: SimpleCommand;
	allCommands: SimpleCommand[];
	args?: unknown;
}

export interface HandlerDefinition {
	// Optional: parses the string inside @handler(<here>) into the handler's args shape.
	// If absent, `args` passed to match() will be the raw string (or undefined when no parens).
	parseArgs?: (argString: string | undefined) => unknown;
	match: (ctx: HandlerCtx) => boolean;
	// Optional override for the rule's reason; rule-level `reason` takes precedence if set.
	reason?: string;
}
