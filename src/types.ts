export type Severity = "forbid" | "ask";

export type RuleKind = "bash" | "path-write" | "path-read";

export interface Match {
	argv0?: string | string[];
	argvAny?: string[];
	argvAll?: string[];
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
	op: ">" | ">>" | "<" | "<<" | "&>" | ">&";
	target: string;
}

export interface SimpleCommand {
	argv: string[];
	redirects: Redirect[];
	pipeNext?: SimpleCommand | undefined;
	pipePrev?: SimpleCommand | undefined;
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

export type Handler = (ctx: HandlerCtx) => boolean;
