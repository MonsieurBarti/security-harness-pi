# Pattern grammar

```
[!]<Tool>(<inner>)[@<handler>[(<args>)]][|<piped-into>]
```

- **Tool**: `Bash` | `Write` | `Edit` | `Read`
- **`!`** (leading): negate this rule — match when the inner would NOT match
- **`@<handler>`**: attach a named handler; optional `(args)` is passed to the handler's `parseArgs`
- **`|<cmd>`**: bash-only — this command must be piped into `<cmd>`

## Bash patterns

| Pattern | Meaning |
|---|---|
| `Bash(rm:*)` | argv0 is `rm`, any args |
| `Bash(rm -rf:*)` | argv0 is `rm`, first arg is `-rf`, any trailing |
| `Bash(git push)` | exact — argv must equal `["git", "push"]` |
| `Bash(git push:*)` | `git push` with any args |
| `Bash(npm install:+)` | `npm install` with at least one non-flag positional |
| `Bash(curl:*)\|sh` | `curl` piped (directly) into `sh` |
| `Bash(git push)@default-branch` | push targeting the repo's default branch |
| `Bash(git push)@branch(release/*,!hotfix/*)` | push to a matching branch, negation-aware |
| `!Bash(rm:-i*)` | negation — exclude interactive `rm` from whatever the rule list implies |

### argv0 matching

- **Literal-only**: `Bash(rm:*)` matches only when the actual argv0 is a literal word. `$X -rf /` or `$(echo rm) -rf /` never match — they're caught by `forbid.nonliteral-argv0`.
- **Basename normalization**: `/bin/rm` matches `Bash(rm:*)`. Path prefixes don't evade.
- **AST decoding**: `'r''m' -rf /` matches `Bash(rm:*)`. Quote concatenation, ANSI-C escapes (`$'\162\155'`), and backslash escapes (`\rm`) are resolved before matching.

### `:*` vs `:+` vs no tail

- No tail → **exact length** match (`Bash(git push)` rejects `git push origin`)
- `:*` → zero-or-more trailing tokens
- `:+` → at least one non-flag positional in the trailing tokens

## Path patterns

| Pattern | Meaning |
|---|---|
| `Write(.env*)` | relative glob — matches paths inside the project root |
| `Read(~/.ssh/id_*)` | tilde-expanded absolute glob |
| `Edit(.git/config)` | relative exact path |
| `Write(/etc/**)` | absolute glob anywhere in `/etc` |

### Glob semantics (locked)

- Globs starting with `/` or `~` → matched against the **resolved absolute path**
- Other globs → matched against the **project-relative path**
- Paths outside the project root never match relative globs

### `Edit` vs `Write`

`Edit(...)` compiles to the same kind as `Write(...)` (both are path-write rules). The hook treats `edit` and `write` tool calls identically.

## Handlers

All handlers are in a closed registry — you configure existing ones, you cannot add new ones in user config (that would be code execution). To add custom logic, write a separate pi extension that runs before this one.

| Handler | Pattern form | Purpose |
|---|---|---|
| `default-branch` | `Bash(git push)@default-branch` | push target equals the repo's default branch |
| `branch` | `Bash(git push)@branch(release/*,!hotfix/*)` | push target matches a glob with negation |
| `force` | `Bash(git push)@force` | `--force`, `-f`, or `--force-with-lease` |
| `pkg-install` | `Bash(npm install:+)@pkg-install` | `npm/yarn/pnpm/bun` install/add with a package |
| `pip-install` | `Bash(pip install:+)@pip-install` | `pip install <pkg>` excluding `-r`/`-e` |
| `cargo-add` | `Bash(cargo add:*)@cargo-add` | `cargo add <pkg>` excluding `--dry-run` |
| `curl-pipe-shell` | `Bash(curl:*)@curl-pipe-shell` | downloader → transitive pipe → shell |
| `pipe-to-shell` | `Bash(*)@pipe-to-shell` | any non-shell command → transitive pipe → shell |
| `reverse-shell` | `Bash(nc:*)@reverse-shell` | `nc -e`/`-l`, `/dev/tcp/*` redirects |
| `fork-bomb` | (default rule only) | 3+ bare `:` commands from function-def parsing |
| `nonliteral-argv0` | (default rule only) | argv0 is variable / substitution / process-substitution |
| `escapes-project` | `Write(*)@escapes-project` | path resolves outside project root |

## Config merge

1. **Defaults** from `src/defaults.ts`
2. **Global** `~/.pi/agent/security-harness.json`:
   - `disable` removes default rules by id
   - `forbid`, `ask`, `rules` add new rules
3. **Project** `<project>/.pi/security-harness.json`:
   - `forbid`, `ask`, `rules` add new rules
   - **`disable`, `enabled`, `mode` are ignored** with a warning (an agent with project write access cannot relax global settings)
4. De-duplicated by id — **later wins**

## Modes

- **`enforce`** — block per policy (default)
- **`warn`** — never block; `ruleId` preserved in the log for "would-have-blocked" audit

## Default rules

See `src/defaults.ts` for the authoritative list. Summary:

**Forbidden:**
- Privilege escalation (`sudo`, `su`, `doas`)
- `rm -rf` on `/`, `~`, or `$HOME`
- `dd` to device, `mkfs`, fork bombs
- `curl | sh` (downloader piped into shell)
- Reverse shells (`nc -e`, `/dev/tcp/*`)
- Variable / substitution / process-substitution as argv0
- Reads of `~/.ssh/id_*`, `~/.aws/credentials`, `~/.gnupg/**`, `~/.config/gh/hosts.yml`
- Writes to system paths (`/etc`, `/usr`, `/System`, etc.)
- Writes escaping the project root
- `eval`

**Ask-first:**
- `git push` to default branch, force push, merge, destructive git
- Package publish (`npm/yarn/pnpm/bun publish`, `cargo publish`, `gh release create`)
- Package install with a new dep (`npm install react`, `pip install flask`, `cargo add`)
- `rm -rf <any target>` (even non-root)
- Any command piped into a shell interpreter
- Writes/reads of `.env*`, `*.pem`, `*.key`, `**/secrets/**`, `.github/workflows/**`
- Mass delete (`find ... -delete`, `xargs rm`)
- Download of scriptable files (`curl x.sh`)
- Dynamic interpreters (`python -c`, `node -e`, `perl -e`, `ruby -e`)
- `env` prefix (PATH manipulation)
