import { describe, expect, it } from "vitest";
import { npmInstallWithPkg } from "../../../src/handlers/npm-install-with-pkg.js";
import { sc } from "./_fixtures.js";

describe("npmInstallWithPkg", () => {
	it("matches npm install react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches npm i react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "i", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare npm install", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["npm", "install"]), allCommands: [] }),
		).toBe(false);
	});
	it("does not match npm install --save-dev (no positional)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "--save-dev"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("matches yarn add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["yarn", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches pnpm add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["pnpm", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches bun add react", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["bun", "add", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches npm install --save-dev react (mixed flags + positional)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["npm", "install", "--save-dev", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches /usr/bin/npm install react via argv0Basename", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["/usr/bin/npm", "install", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match unknown subcommand", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["npm", "ci"]), allCommands: [] }),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — bun install/i", () => {
	it("matches bun install <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["bun", "install", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches bun i <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["bun", "i", "react"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare bun install", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["bun", "install"]), allCommands: [] }),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — cargo install", () => {
	it("matches cargo install <binary>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["cargo", "install", "ripgrep"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches cargo install --path <dir>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["cargo", "install", "--path", "./mycrate"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match cargo install --list (no positional)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["cargo", "install", "--list"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match bare cargo install", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["cargo", "install"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — brew install", () => {
	it("matches brew install <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["brew", "install", "wget"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare brew install", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["brew", "install"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — go install", () => {
	it("matches go install <module>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["go", "install", "example.com/pkg@latest"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare go install (current module, not a new dep)", () => {
		expect(
			npmInstallWithPkg.match({ cwd: "/", simpleCommand: sc(["go", "install"]), allCommands: [] }),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — gem install", () => {
	it("matches gem install <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["gem", "install", "rails"]),
				allCommands: [],
			}),
		).toBe(true);
	});
});

describe("npmInstallWithPkg — composer require", () => {
	it("matches composer require <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["composer", "require", "symfony/http-foundation"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match composer install (no pkg arg)", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["composer", "install"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — poetry add", () => {
	it("matches poetry add <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["poetry", "add", "flask"]),
				allCommands: [],
			}),
		).toBe(true);
	});
});

describe("npmInstallWithPkg — uv add / uv pip install", () => {
	it("matches uv add <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["uv", "add", "requests"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches uv pip install <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["uv", "pip", "install", "flask"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match uv pip list", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["uv", "pip", "list"]),
				allCommands: [],
			}),
		).toBe(false);
	});
	it("does not match uv pip install with only flags", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["uv", "pip", "install", "--upgrade"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});

describe("npmInstallWithPkg — deno install / add", () => {
	it("matches deno install --name foo <url>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc([
					"deno",
					"install",
					"--name",
					"foo",
					"https://deno.land/std/http/file_server.ts",
				]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("matches deno add <pkg>", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["deno", "add", "npm:lodash"]),
				allCommands: [],
			}),
		).toBe(true);
	});
	it("does not match bare deno install", () => {
		expect(
			npmInstallWithPkg.match({
				cwd: "/",
				simpleCommand: sc(["deno", "install"]),
				allCommands: [],
			}),
		).toBe(false);
	});
});
