import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import type { BashAnalysis, Redirect, SimpleCommand } from "../types.js";

const WASM_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"wasm",
	"tree-sitter-bash.wasm",
);

export class BashAnalyzer {
	private constructor(private parser: Parser) {}

	static async create(): Promise<BashAnalyzer> {
		await Parser.init();
		const parser = new Parser();
		const bytes = readFileSync(WASM_PATH);
		const lang = await Parser.Language.load(bytes);
		parser.setLanguage(lang);
		return new BashAnalyzer(parser);
	}

	analyze(command: string): BashAnalysis {
		const tree = this.parser.parse(command);
		if (!tree) return { commands: [], parseError: "tree-sitter returned null" };
		const root = tree.rootNode;
		if (root.hasError) {
			return { commands: [], parseError: "syntax error in command" };
		}
		const commands: SimpleCommand[] = [];
		walk(root, commands);
		return { commands };
	}
}

function walk(node: Parser.SyntaxNode, out: SimpleCommand[]): void {
	if (node.type === "command") {
		const sc = extractSimpleCommand(node);
		if (sc) out.push(sc);
		// TODO Task 5: descend into command_substitution / string children before returning
		return;
	}
	for (const child of node.namedChildren) {
		walk(child, out);
	}
}

function extractSimpleCommand(node: Parser.SyntaxNode): SimpleCommand | null {
	const argv: string[] = [];
	const redirects: Redirect[] = []; // TODO Task 6: populate from file_redirect children
	for (const child of node.namedChildren) {
		const type = child.type;
		if (type === "concatenation") {
			const parts: string[] = [];
			for (const sub of child.namedChildren) {
				if (sub) parts.push(unquote(sub.text));
			}
			argv.push(parts.join(""));
			continue;
		}
		if (
			type === "command_name" ||
			type === "word" ||
			type === "string" ||
			type === "raw_string" ||
			type === "number"
		) {
			argv.push(unquote(child.text));
		}
	}
	if (argv.length === 0) return null;
	return { argv, redirects, raw: node.text };
}

function unquote(s: string): string {
	if (s.length >= 2 && (s.startsWith("'") || s.startsWith('"'))) {
		const q = s[0] as string;
		if (s.endsWith(q)) return s.slice(1, -1);
	}
	return s;
}
