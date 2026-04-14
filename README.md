# @the-forge-flow/security-harness-pi

Security harness for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent). Forbids dangerous tool calls, asks approval for sensitive ones, allows everything else by default.

## What it does

- **Hard-forbid**: `sudo`, `rm -rf /`, `curl | sh`, reverse shells, system-path writes, credential reads — blocked with no prompt.
- **Ask-first**: `git push` to the default branch, force-push, `git merge`, `npm install <pkg>`, `rm -rf <any>`, writes/reads of `.env` / secrets / CI files, dynamic interpreter calls (`python -c`, `node -e`), any command piped into a shell.
- **Allow**: anything not matched by a rule.

Commands are parsed into an AST and every simple-command inside pipes, `$(...)`, `eval`, `bash -c` is classified independently. Parse errors fail closed. 329 tests including a dedicated adversarial bypass suite.

## Install

```bash
pi install npm:@the-forge-flow/security-harness-pi
```

Then reload pi: `/reload`.

## Configure

Configuration files (both optional):

- **Global** (can tighten and relax): `~/.pi/agent/security-harness.json`
- **Project** (tighten only): `<project>/.pi/security-harness.json`

### Minimal config (use all defaults)

```json
{ "enabled": true }
```

### Tighten a project

```json
{
  "forbid": [
    "Bash(./scripts/deploy-prod.sh)",
    "Write(.env.production)"
  ],
  "ask": [
    "Bash(docker system prune:*)"
  ]
}
```

### Opt out of a baked-in rule (global only)

```json
{
  "disable": ["default:forbid.eval"],
  "mode": "enforce"
}
```

Project-level `disable`, `enabled`, and `mode` are ignored with a warning — an agent with project write access cannot relax global settings.

See [`docs/rules.md`](docs/rules.md) for the full pattern grammar and handler catalogue.

## Commands

- `/security-status` — active rules, config sources, recent decisions
- `/security-reload` — reload config without restarting pi

## Pattern grammar (quick reference)

```
[!]<Tool>(<inner>)[@<handler>[(<args>)]][|<piped-into>]
```

| Pattern | Matches |
|---|---|
| `Bash(rm:*)` | `rm` with any args |
| `Bash(rm -rf:*)` | `rm` with first arg `-rf` |
| `Bash(git push)` | exact `git push` (no args) |
| `Bash(npm install:+)` | `npm install` with a package name |
| `Bash(curl:*)\|sh` | `curl` piped into `sh` |
| `Bash(git push)@default-branch` | push targeting the repo's default branch |
| `Write(.env*)` | writes matching a glob |
| `Read(~/.ssh/id_*)` | reads of a home-rooted glob |
| `!Bash(rm:-i*)` | negation (exclude interactive `rm`) |

## Modes

- **`enforce`** (default) — block per policy
- **`warn`** — never block; log what would have been blocked (for dry runs / rule development)

## Limitations

Static analysis can't cover everything. What this does NOT protect against:

- **Variable expansion**: `RM=/bin/rm; $RM -rf /` — mitigated by forbidding any simple-command whose argv0 is not a literal
- **Dynamic interpreter contents**: `python -c "..."` — routed to ask-first, human inspects
- **Race conditions**: agent writes a script then executes it — only the `bash ./script.sh` call is visible
- **Side-channels**: agent reads a file and embeds content in response — not a command, can't intercept

See [`docs/threat-model.md`](docs/threat-model.md) for the full list and the recommended layering strategy.

## Development

```bash
bun install      # install deps
bun run test     # vitest run
bun run lint     # biome check
bun run typecheck
bun run build    # tsc → dist/
```

## License

MIT © 2026 MonsieurBarti
