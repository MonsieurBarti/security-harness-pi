# Threat model

## What this protects against

- **Agent runs commands it shouldn't, by mistake.** Hallucinations, misunderstood instructions, cargo-culted snippets.
- **Prompt-injection payloads** trying to talk the agent into `sudo`, `rm -rf /`, `curl | sh`, or writing CI-takeover files.
- **Accidental writes** to `.env`, CI workflow files, SSH keys, GPG credentials.
- **Accidental `git push --force`** or push to the repo's default branch.
- **Accidental dependency additions** (`npm install <malicious-pkg>`) — ask-first forces human review.

The harness sits between the agent's `tool_call` event and pi's execution. Every bash command is parsed to an AST and every simple-command is classified independently. Paths are checked against glob rules.

## What this does NOT protect against

### Compromised pi host
If the user's machine is already compromised (agent auth keys stolen, pi binary tampered), this extension cannot save them. It's a policy layer, not a trusted computing base.

### Dynamic interpreter contents
`python -c "import os; os.system('rm -rf /')"`, `node -e "..."`, `perl -e "..."` — the interpreter's code is opaque to a bash parser. **Mitigation**: these are routed to ask-first; the human reviews the code before approval.

### Variable-expansion evasion
`RM=/bin/rm; "$RM" -rf /` — static analysis cannot resolve variable values at the point of use. **Mitigation**: any simple-command whose argv0 is not a literal word (`$X`, `${FOO}`, `$(...)`, `` `...` ``, `<(...)`) is hard-forbidden (`forbid.nonliteral-argv0`).

### Race conditions between check and exec
If the agent writes a malicious script file to disk and then runs `bash ./script.sh`, the harness only sees the `bash` call — not the script's contents. **Mitigation**: layer the OS sandbox (`@anthropic-ai/sandbox-runtime` via the sample `sandbox` extension) on top.

### Side-channels
The agent reads a file and includes the contents in its prompt response rather than via a network call. That's not a command — this extension can't intercept tokens in the agent's own output.

### Exotic bash forms not exercised by tests
Adversarial fuzzing covers 55 known bypass classes (see `tests/adversarial/bypass-attempts.spec.ts`). Exotic forms (e.g. Brace expansion with substitutions, `printf %b` decoding into `eval`, POSIX-only quoting quirks) may exist. New bypasses become new tests and new rules.

## Fail-closed invariants

The harness blocks (never silently allows) when:

| Situation | Behavior |
|---|---|
| Bash parse error | forbid |
| Nesting depth > 16 | forbid |
| Input size > 64 KB | forbid |
| Extracted simple-commands > 256 | forbid |
| Config load error | block bash/write/edit/read for the session |
| Extension init crash | block bash/write/edit/read for the session |
| `tool_call` before `session_start` completes | block bash/write/edit/read |
| Ask rule matches AND no UI available | block |
| `ctx.ui.confirm` rejects or times out | block (treated as "No") |
| `input.command` or `input.path` is not a string | block |
| Project config sets `enabled: false` | **ignored** (warning), global config still governs |
| Project config sets `mode: "warn"` | **ignored** (warning), global config still governs |
| Project config uses `disable` | **ignored** (warning) |

## Layering recommendation

For production trust, combine:

1. **security-harness-pi** (this extension) — policy enforcement
2. **sandbox extension** (OS-level filesystem + network confinement via `sandbox-exec` on macOS, `bubblewrap` on Linux) — see pi-coding-agent's `examples/extensions/sandbox/`
3. **Human review** — for any ask-first prompt, actually read the command

The three layers address different threat classes:

| Layer | Protects against |
|---|---|
| security-harness-pi | agent running the wrong command on purpose-ish |
| sandbox | the command succeeding at the wrong thing (e.g., writing outside the allowed dirs) |
| human review | anything the first two missed |

No single layer is sufficient.

## Reporting a bypass

If you find a command that ends in `"allow"` when it shouldn't, please open an issue with the exact command string. Bypasses become adversarial test cases — every fix ships with the test that would have caught it.
