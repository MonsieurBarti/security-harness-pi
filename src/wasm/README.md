# tree-sitter-bash.wasm

Vendored grammar for the bash AST parser used by `BashAnalyzer`.

- **Source:** https://github.com/tree-sitter/tree-sitter-bash
- **Version:** 0.23.3 (ABI 14, compatible with web-tree-sitter ^0.23)
- **Loader:** `web-tree-sitter` (see `dependencies` in package.json)
- **SHA-256:** `d1844429a58620f306b6f42aebe92298243ca8120cd833a3ab5d87c7a2e7b9fd`

To rebuild from source:
```bash
bunx tree-sitter-cli@^0.23 build --wasm --output src/wasm/tree-sitter-bash.wasm node_modules/tree-sitter-bash
```
