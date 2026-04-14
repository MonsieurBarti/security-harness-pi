# tree-sitter-bash.wasm

Vendored grammar for the bash AST parser used by `BashAnalyzer`.

- **Source:** https://github.com/tree-sitter/tree-sitter-bash
- **Version:** unknown (downloaded via /releases/latest/ on 2026-04-14)
- **Loader:** `web-tree-sitter` (see `dependencies` in package.json)
- **SHA-256:** `8292919c88a0f7d3fb31d0cd0253ca5a9531bc1ede82b0537f2c63dd8abe6a7a`

To rebuild from source:
```bash
bunx tree-sitter-cli@^0.23 build --wasm --output src/wasm/tree-sitter-bash.wasm node_modules/tree-sitter-bash
```
