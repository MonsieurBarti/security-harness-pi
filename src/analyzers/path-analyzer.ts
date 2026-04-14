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
		const insideProject = !rel.startsWith("..") && !isAbsolute(rel);

		for (const glob of globs) {
			const isAbsoluteGlob = glob.startsWith("/") || glob.startsWith("~");
			const expanded =
				isAbsoluteGlob && glob.startsWith("~") ? glob.replace(/^~(?=\/|$)/, homedir()) : glob;
			const matcher = picomatch(expanded, { dot: true });
			if (isAbsoluteGlob) {
				if (matcher(abs)) return true;
			} else {
				// relative glob — only matches paths inside the project
				if (insideProject && matcher(rel)) return true;
			}
		}
		return false;
	}
}
