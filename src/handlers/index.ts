import type { HandlerDefinition } from "../types.js";
import { cargoAdd } from "./cargo-add.js";
import { curlPipeShell } from "./curl-pipe-shell.js";
import { forkBomb } from "./fork-bomb.js";
import { gitPushBranch } from "./git-push-branch.js";
import { gitPushDefaultBranch } from "./git-push-default-branch.js";
import { gitPushForce } from "./git-push-force.js";
import { nonliteralArgv0 } from "./nonliteral-argv0.js";
import { npmInstallWithPkg } from "./npm-install-with-pkg.js";
import { pathEscapesProject } from "./path-escapes-project.js";
import { pipInstallWithPkg } from "./pip-install-with-pkg.js";
import { reverseShell } from "./reverse-shell.js";

const registry: Record<string, HandlerDefinition> = {
	force: gitPushForce,
	branch: gitPushBranch,
	"default-branch": gitPushDefaultBranch,
	"pkg-install": npmInstallWithPkg,
	"pip-install": pipInstallWithPkg,
	"cargo-add": cargoAdd,
	"curl-pipe-shell": curlPipeShell,
	"reverse-shell": reverseShell,
	"escapes-project": pathEscapesProject,
	"nonliteral-argv0": nonliteralArgv0,
	"fork-bomb": forkBomb,
};

export function getHandler(name: string): HandlerDefinition | undefined {
	return registry[name];
}

export function listHandlers(): string[] {
	return Object.keys(registry);
}

export function __registerHandlerForTests(name: string, def: HandlerDefinition): void {
	registry[name] = def;
}
