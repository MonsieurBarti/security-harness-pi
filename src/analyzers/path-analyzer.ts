import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import picomatch from "picomatch";

export class PathAnalyzer {
	constructor(private cwd: string) {}

	resolve(p: string): string {
		const expanded = p.startsWith("~") ? p.replace(/^~(?=\/|$)/, homedir()) : p;
		return isAbsolute(expanded) ? expanded : resolve(this.cwd, expanded);
	}

	escapesProject(p: string): boolean {
		const abs = this.resolve(p);
		const rel = relative(this.cwd, abs);
		return rel.startsWith("..") || isAbsolute(rel);
	}

	matches(p: string, globs: string[]): boolean {
		const abs = this.resolve(p);
		const rel = relative(this.cwd, abs);
		const expanded = globs.map((g) => (g.startsWith("~") ? g.replace(/^~(?=\/|$)/, homedir()) : g));
		const matcher = picomatch(expanded, { dot: true });
		return matcher(abs) || matcher(rel);
	}
}
