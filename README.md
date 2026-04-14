<div align="center">
  <img src="https://raw.githubusercontent.com/MonsieurBarti/The-Forge-Flow-CC/refs/heads/main/assets/forge-banner.png" alt="The Forge Flow - Security Harness Extension" width="100%">

  <h1>@the-forge-flow/security-harness-pi</h1>

  <p>
    <strong>Permission-gate for the PI coding agent — forbids dangerous commands and asks approval for sensitive ones</strong>
  </p>

  <p>
    <a href="https://github.com/MonsieurBarti/security-harness-pi/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/MonsieurBarti/security-harness-pi/ci.yml?label=CI&style=flat-square" alt="CI Status">
    </a>
    <a href="https://www.npmjs.com/package/@the-forge-flow/security-harness-pi">
      <img src="https://img.shields.io/npm/v/@the-forge-flow/security-harness-pi?style=flat-square" alt="npm version">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/MonsieurBarti/security-harness-pi?style=flat-square" alt="License">
    </a>
  </p>
</div>

---

## What it does

PI extension that intercepts every tool call from the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) and classifies it against a policy: hard-forbid the obviously dangerous, ask-first on the sensitive, allow everything else. Commands are parsed into an AST and every simple-command inside pipes, `$(...)`, `eval`, and `bash -c` is classified independently. Parse errors fail closed.

## Features

- **Hard-forbid** — `sudo`, `rm -rf /`, `curl | sh`, reverse shells, system-path writes, credential reads — blocked with no prompt
- **Ask-first** — `git push` to the default branch, force-push, `git merge`, package installs across ecosystems (npm/yarn/pnpm/bun/cargo/brew/go/gem/composer/poetry/uv/deno), `rm -rf <any>`, writes/reads of `.env` / secrets / CI files, dynamic interpreter calls (`python -c`, `node -e`), any command piped into a shell
- **Allow** — anything not matched by a rule
- **AST-based parsing** — pipes, subshells, `eval`, `bash -c` classified independently; argv0 must be a literal (no `$RM -rf /`)
- **Two-tier config** — global can tighten *and* relax, project can only tighten; an agent with project write access cannot weaken global rules
- **329 tests** including a dedicated adversarial bypass suite

## Requirements

- Node.js >= 22.5.0
- PI (`pi` CLI) installed

## Installation

```bash
# Global (all projects)
pi install npm:@the-forge-flow/security-harness-pi

# Project-local
pi install -l npm:@the-forge-flow/security-harness-pi

# From GitHub (tracks main)
pi install git:github.com/MonsieurBarti/security-harness-pi

# Pin a version
pi install npm:@the-forge-flow/security-harness-pi@0.1.1
```

Then reload PI with `/reload` (or restart it).

## Commands

- `/security-status` — active rules, config sources, recent decisions
- `/security-reload` — reload config without restarting PI

## Configuration

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

- **Variable expansion** — `RM=/bin/rm; $RM -rf /` — mitigated by forbidding any simple-command whose argv0 is not a literal
- **Dynamic interpreter contents** — `python -c "..."` — routed to ask-first, human inspects
- **Race conditions** — agent writes a script then executes it — only the `bash ./script.sh` call is visible
- **Side-channels** — agent reads a file and embeds content in response — not a command, can't intercept

See [`docs/threat-model.md`](docs/threat-model.md) for the full list and the recommended layering strategy.

## Development

```bash
bun install
bun run test        # vitest
bun run lint        # biome check
bun run typecheck   # tsc --noEmit
bun run build       # tsc → dist/
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit with conventional commits (`git commit -m "feat: add something"`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT © 2026 MonsieurBarti
