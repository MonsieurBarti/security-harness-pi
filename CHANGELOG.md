# Changelog

## [0.1.1](https://github.com/MonsieurBarti/security-harness-pi/compare/security-harness-pi-v0.1.0...security-harness-pi-v0.1.1) (2026-04-14)


### Documentation

* align readme with sibling tff extensions ([605c161](https://github.com/MonsieurBarti/security-harness-pi/commit/605c1615366ab267decf9d8064d9c74e51ba3a36))

## 0.1.0 (2026-04-14)


### Features

* add baked-in default forbid/ask rule bundle ([3b3cc89](https://github.com/MonsieurBarti/security-harness-pi/commit/3b3cc89989c0f06a90af792994dfefccd63dc987))
* add bash analyzer for plain commands ([7e1e54e](https://github.com/MonsieurBarti/security-harness-pi/commit/7e1e54e982f67d9ebf1aff9e0e97ee95d79464c7))
* add core types ([df5b769](https://github.com/MonsieurBarti/security-harness-pi/commit/df5b76949d7af6a30c8c842b003fdb6a09c95aae))
* add path analyzer ([79a733f](https://github.com/MonsieurBarti/security-harness-pi/commit/79a733f411b8b33565d67f3b7676f5b212b0df90))
* **analyzer:** capture file redirects ([113a54d](https://github.com/MonsieurBarti/security-harness-pi/commit/113a54de836e58c05ca6dc6116be331420014cf1))
* **analyzer:** descend into substitutions and shell -c ([44da107](https://github.com/MonsieurBarti/security-harness-pi/commit/44da1075d8e8a11d937d7315f48a418e0650bb61))
* **analyzer:** support pipes and compound commands ([7f18e3e](https://github.com/MonsieurBarti/security-harness-pi/commit/7f18e3e32d21666597059391cbcf6bb67e699644))
* **commands:** add security-reload command ([2a0f227](https://github.com/MonsieurBarti/security-harness-pi/commit/2a0f2276c99ca1bc0f96c49582c93b1cbeb2725e))
* **commands:** add security-status command ([3c94ba5](https://github.com/MonsieurBarti/security-harness-pi/commit/3c94ba5a4a383fce62618a199c94b4b65c0f2ac1))
* **handlers:** add closed registry stub for phase 2 ([d407630](https://github.com/MonsieurBarti/security-harness-pi/commit/d4076303776a1680b8488758508d4921be8e1c48))
* **handlers:** add curl-pipe-shell with transitive pipe walk ([333f2bc](https://github.com/MonsieurBarti/security-harness-pi/commit/333f2bc23f6a723dc08c9befb073f13ae8a6c6af))
* **handlers:** add git-push-branch handler with negation ([312cec5](https://github.com/MonsieurBarti/security-harness-pi/commit/312cec59b41ed9ba803965b69d66731aa8f300c4))
* **handlers:** add git-push-default-branch handler with injectable resolvers ([965a038](https://github.com/MonsieurBarti/security-harness-pi/commit/965a038ad959e55edf7ad6258ac3e58500524f4b))
* **handlers:** add git-push-force handler ([9299aec](https://github.com/MonsieurBarti/security-harness-pi/commit/9299aecd1b172ab0bcf1506099067aa5c4dd15b2))
* **handlers:** add package-install handlers (npm yarn pnpm bun pip cargo) ([79bc9cb](https://github.com/MonsieurBarti/security-harness-pi/commit/79bc9cbb26435e62f3337ae8e8b17b99abe5abcb))
* **handlers:** add path-escapes-project handler ([17ba9a4](https://github.com/MonsieurBarti/security-harness-pi/commit/17ba9a428365ca4d05ed0afc30e46f300227dca3))
* **handlers:** add reverse-shell handler ([f5f8ecf](https://github.com/MonsieurBarti/security-harness-pi/commit/f5f8ecf0b18361495540097ad55650e00b72287d))
* **handlers:** broaden pkg-install to cargo/brew/go/gem/composer/poetry/uv/deno + bun install ([0b58ac8](https://github.com/MonsieurBarti/security-harness-pi/commit/0b58ac809f29546db22c506b79aad96f2fee57a6))
* **handlers:** finalize closed registry with all phase 3 handlers ([03e82f5](https://github.com/MonsieurBarti/security-harness-pi/commit/03e82f5e6441e4c7ca58b0f04fe5f71ce92859ea))
* **hooks:** add tool-call hook handler ([c155f8e](https://github.com/MonsieurBarti/security-harness-pi/commit/c155f8ecca3533fe6dd9aaad37225d239374a3b5))
* **matcher:** add matches-bash with hardened argv0 and argv-exact flag ([9ec0884](https://github.com/MonsieurBarti/security-harness-pi/commit/9ec08845edf4c4cbe552cc80f5db34defe8fc27d))
* **matcher:** add matches-path with handler dispatch ([3898a2c](https://github.com/MonsieurBarti/security-harness-pi/commit/3898a2c135bdac6304647806e070288e504f08d3))
* **parser:** add pattern string parser for bash patterns ([00bdf36](https://github.com/MonsieurBarti/security-harness-pi/commit/00bdf36bbc668d2ca75f74742e229bba3a5c4d93))
* **parser:** support path patterns, [@handler](https://github.com/handler), |pipe, ! negation ([3eb9574](https://github.com/MonsieurBarti/security-harness-pi/commit/3eb95743944e0467249c959f28f214d68f71c4a0))
* **phase-1:** foundation — types, BashAnalyzer, PathAnalyzer ([ebc9e62](https://github.com/MonsieurBarti/security-harness-pi/commit/ebc9e621781b7fd874dc84d4a6c876dee02168b8))
* **phase-2:** pattern language and matchers ([f21a3ab](https://github.com/MonsieurBarti/security-harness-pi/commit/f21a3abc60ca3234f1c28e33db75f91d881b1643))
* **phase-3:** named handlers ([388d6cf](https://github.com/MonsieurBarti/security-harness-pi/commit/388d6cf5036f69050acb5620e71ce5618850c81a))
* **phase-4:** defaults, config-loader, policy-engine, session-log ([630aaed](https://github.com/MonsieurBarti/security-harness-pi/commit/630aaed91071a0566cff402136afac68212c0a81))
* **phase-5:** tool-call hook, commands, extension entry ([6050806](https://github.com/MonsieurBarti/security-harness-pi/commit/6050806d5ea6f32e293440f3638a013bfa0cc340))
* **phase-6:** adversarial suite + user-facing docs ([2c1de8f](https://github.com/MonsieurBarti/security-harness-pi/commit/2c1de8f0cf2c256c9dc279bfc6e3f7a0bfeebb9a))
* **services:** add config-loader with defaults + global + project merge ([f2a4806](https://github.com/MonsieurBarti/security-harness-pi/commit/f2a48062f220c7158e93a15c22ccb1defe6d77ea))
* **services:** add policy-engine with forbid&gt;ask&gt;allow and warn mode ([6ce4429](https://github.com/MonsieurBarti/security-harness-pi/commit/6ce4429fcad63d1c9208bdd2821bba727f1db0de))
* **services:** add session-log ring buffer ([0c4ef42](https://github.com/MonsieurBarti/security-harness-pi/commit/0c4ef4285ee5a0ef21da31a3126fcbe3d04e97f9))
* wire extension entry with session_start + tool_call + commands ([bae4890](https://github.com/MonsieurBarti/security-harness-pi/commit/bae4890e906f016e4363e52c596ef89736b3fbaa))


### Bug Fixes

* **analyzer:** cap depth/size, lock glob semantics, redirect honesty, drop module state ([404ae0b](https://github.com/MonsieurBarti/security-harness-pi/commit/404ae0b808e16492d6006b4efd4493cfb697aa79))
* **analyzer:** re-parse eval, decode ast-typed args, finish basename/substitution argv0 ([939bca2](https://github.com/MonsieurBarti/security-harness-pi/commit/939bca2e114d924b8a8ca91e789a98bd291356ae))
* **analyzer:** ship wasm to dist, drop tree-sitter-bash dep, fix concatenation unquoting ([1362415](https://github.com/MonsieurBarti/security-harness-pi/commit/13624155b47c800aeb380d721b6e636402907583))
* **analyzer:** walk process substitutions, unwrap transparent wrappers, parse -c flag clusters ([7af7e4e](https://github.com/MonsieurBarti/security-harness-pi/commit/7af7e4e5c2f99cc54d14f5b5b290e94d5fc4f879))
* **config:** ignore project-level enabled/mode (h1/h2) ([7c41a6a](https://github.com/MonsieurBarti/security-harness-pi/commit/7c41a6ab9a8de9061e658096b0610c79c4f25d90))
* **defaults:** ask on any rm -rf regardless of target ([ae7f5a8](https://github.com/MonsieurBarti/security-harness-pi/commit/ae7f5a83a49127706fa1acb08aab9d983e20a965))
* **defaults:** use argvkinds to catch all non-literal argv0 (incl. backticks) ([ca1188b](https://github.com/MonsieurBarti/security-harness-pi/commit/ca1188b640d6b2d1146e67ba59565b53791bca7e))
* **entry:** block bash/write/edit/read when uninitialized (m4) ([35e9a49](https://github.com/MonsieurBarti/security-harness-pi/commit/35e9a496dee915502414993492ec5eed60598de1))
* **handlers:** ask on any command piped into a shell interpreter ([df4f981](https://github.com/MonsieurBarti/security-harness-pi/commit/df4f98161c46cf53fc32dc9e53babfaca08cd702))
* **handlers:** detect fork bomb via bare-colon command signature ([6bdabc1](https://github.com/MonsieurBarti/security-harness-pi/commit/6bdabc1cfda5ead9c1cf6e68f3eeebf77cbec9e3))
* **hook:** fail-closed on non-string command/path input (m2) ([fff015d](https://github.com/MonsieurBarti/security-harness-pi/commit/fff015dd53949d866fbe562002f098989520be2c))


### Miscellaneous Chores

* force initial release as 0.1.0 ([5769c15](https://github.com/MonsieurBarti/security-harness-pi/commit/5769c15273774c842b21b2c074068c7090f09b19))
