---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0009: Path and env confinement for built-in helpers

## Context and Problem Statement

[ADR-0008](0008-jsonlogic-builtin-helpers.md) specifies *what* the 16 built-in JSONLogic helpers do — read-only, no contents, no network, no subprocess, never throw. It does not specify *where* they may look. The Plan 3 Phase 2 implementation in `src/runtime/util/helpers.ts` takes absolute paths verbatim and reads any env var by name, which re-creates the classic PHP local-file-inclusion / env-exfiltration bug under a new coat of paint:

```yaml
# An author wiring this makes the whole filesystem a path oracle:
handler:
  compute: { "file.exists": [{ var: "path" }] }
```

A prompt-injected LLM acting as the MCP client — the baseline adversary for any MCP server in 2026 — can feed `/etc/passwd`, `/Users/clay/.ssh/id_ed25519`, `/Users/clay/.aws/credentials`, `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY` and receive a direct information leak through the tool result. Relative paths with `..` segments escape the runtime directory without resistance; symlinks planted inside otherwise-benign directories let the attacker read anywhere the process can.

Authors can't be trusted to remember the safe pattern every time. The right fix is to make the unsafe pattern hard — containers-and-capabilities style, the same model Deno's `--allow-read=…`, Docker's volume mounts, systemd's `ReadOnlyPaths=`, and OpenBSD's `pledge(2)` all converge on.

## Decision Drivers

- **Prompt-injected LLM clients are the baseline threat, not an edge case.** Every helper call evaluates against attacker-reachable arguments.
- **Defaults matter more than options.** Authors will not read a "security" section before writing their first guard. The default must be safe enough that the common case stays working and the dangerous case requires opt-in.
- **Helpers never throw per ADR-0008.** Denial must return the same `null`/`false` failure signal as a missing file or unset env var — security failures are indistinguishable from plain misses at the rule level.
- **Capability-scoped runtimes are the proven shape.** Deno, Docker, systemd, `pledge` all land on "declare what's reachable up front, deny everything else." jig should borrow the proven protocol.
- **ADR-0008's surface is already finalized.** This decision layers containment on top of the existing 16 helpers without changing their names or signatures. Authors still call `file.exists(path)` — the rejection happens inside.
- **The `exec:` and `compute:` handlers already cover escape hatches.** An author who needs to inspect `/etc` legitimately can either declare the allowlist or drop to `exec:` with `stat` — this ADR does not remove capability, it forces it to be declared.

## Considered Options

- **A. Reject `..` segments in relative paths; leave absolute paths open** — smallest change, catches accidents, ships the CVE against deliberate probes.
- **B. Confined roots via an opt-in allowlist + `realpath` symlink check + env allowlist** (chosen).
- **C. Per-tool access capabilities** — each `tools[i]` declares its own filesystem/env scopes.
- **D. Trust the author; document the risk in ADR-0008** — the PHP approach. Rejected because two decades of LFI bugs settled the argument.

## Decision Outcome

Chosen: **B. Confined roots via opt-in allowlist + `realpath` check + env allowlist, with opinionated safe defaults.**

### YAML surface

A new optional `security` block under `server:` declares allowed filesystem roots and env var patterns:

```yaml
server:
  name: my-server
  version: "1.0.0"
  security:
    filesystem:
      allow:
        - "."                       # RUNTIME_ROOT subtree (default if block absent)
        - "$HOME/.config/my-tool"   # $VAR / ${VAR} expanded at parse time
        - "/etc/ssl/certs"          # absolute paths accepted verbatim
    env:
      allow:
        - "JIG_*"                   # glob patterns (only * is supported)
        - "MY_TOOL_*"
        - "HOME"                    # exact names also accepted
```

No `security:` block ⇒ defaults apply (below).

### Defaults (applied when `security:` is absent or a subfield is omitted)

**`filesystem.allow`:** `["."]` — only files and directories under `RUNTIME_ROOT` (`dirname(fileURLToPath(import.meta.url))` per [ADR-0005](0005-sibling-yaml-from-import-meta-url.md)). Authors must opt into `$HOME`, `/etc`, `/tmp`, or anywhere else. The `homedir()` and `tmpdir()` cases are **not** implicitly allowed — they hold credentials and cached tokens and forcing the author to name them keeps the intention visible in review.

**`env.allow`:** `["JIG_*", "HOME", "USER", "LANG", "LC_*", "TZ", "PATH"]` — the baseline a typical tool needs without exposing conventional secret names. Secrets are overwhelmingly named `*_TOKEN`, `*_SECRET`, `*_KEY`, `*_PASSWORD`, `*_CREDENTIALS` — the default patterns don't match any of them by accident. `PATH` is included because tools that resolve binaries via `exec:` need it; it's not a secret.

### Enforcement

`src/runtime/util/access.ts` owns the check:

- `configureAccess(security: SecurityConfig)` — called once from `src/runtime/index.ts` at boot after the YAML parses. Resolves `filesystem.allow` entries to absolute paths (expanding `$VAR` / `${VAR}` / `~` / `.`), compiles env patterns to `RegExp`s, stores both in module scope.
- `isPathAllowed(input: string): string | null` — returns the canonicalized absolute path if the input resolves (via `realpathSync.native` when it exists on disk, or `resolve` when it does not) to somewhere under an allowed root; `null` otherwise.
- `isEnvAllowed(name: string): boolean` — returns true only if `name` matches at least one pattern.
- Deny-by-default: before `configureAccess` has been called, every check returns false/null. Protects against tests or library consumers that forget to initialize.

The four file helpers (`file.exists`, `file.is_file`, `file.is_dir`, `file.size`) gate on `isPathAllowed` before their `statSync` / `accessSync`. The two env helpers (`env.get`, `env.has`) gate on `isEnvAllowed`. `path.*`, `os.*`, `time.*` are pure string / metadata ops with no disk or env read — they remain ungated.

### `realpath` behavior

For paths that exist, `realpathSync.native` resolves symlinks and canonicalizes; the canonical path is the one checked against the allowlist. Attacker plants `/runtime_root/link -> /etc/passwd`? The realpath is `/etc/passwd`, not under any allowed root, check fails, helper returns `null`/`false`.

For paths that do not exist, there is nothing to symlink-escape; `path.resolve` gives a canonical string which is checked against the allowlist. `file.exists` correctly returns `false` for these even when the nominal path would have been rejected — a non-existent path is, by definition, not reachable.

### Variable expansion in allow entries

Allow entries support shell-style expansion at parse time:

- `$VAR` / `${VAR}` — substituted with `process.env[VAR]`; unset variables produce a parse error (fail closed).
- `~` or `~/` at the start — substituted with `homedir()`.
- `.` — shorthand for `RUNTIME_ROOT`, does not recurse into Mustache or JSONLogic.

This is intentionally narrower than full templating. Plan 2's Mustache and Plan 3's JSONLogic evaluate per-request against args; the allowlist must be determined at startup, so full templating would be both unnecessary and a layer-crossing seam we don't need.

## Consequences

- **Good**, because the PHP-era attack pattern is closed by default — an author writing `{"file.exists": [{"var": "path"}]}` without declaring an allowlist gets a helper that refuses to probe `/etc/passwd` even when asked.
- **Good**, because `realpath` resolution neutralizes the symlink-escape class. Attackers can't plant a link inside an allowed root and read outside.
- **Good**, because the deny-by-default env allowlist captures the conventional secret naming without requiring the author to build a denylist. `JIG_*` gives authors a clear scoping convention.
- **Good**, because the defaults (`["."]` for fs, the safe baseline for env) match the shape of an example `examples/compute-and-guards.yaml` — the `home_config` case just needs a one-line allow entry to work.
- **Good**, because the allowlist is a startup-time check — zero per-invocation cost beyond a `realpath` call and a `startsWith` match. The hot path of guards stays fast.
- **Bad**, because Phase 2 of Plan 3 ships with expanded scope: a new `util/access.ts` module, `SecurityConfig` parsing in `config.ts`, an `index.ts` wire-up, test coverage for allow/deny cases. Phase 3+ of Plan 3 inherit this surface without change.
- **Bad**, because authors who want `$HOME/.config` access must declare it. That is exactly the design goal — visible intent — but it is friction at first contact.
- **Bad**, because the defaults are opinionated. A project with non-standard env conventions may need to declare a larger allowlist. The escape hatch is one YAML line.
- **Bad**, because `$VAR` expansion at parse time means a deployment where `$HOME` is unset (a container, a daemon) fails closed. That's the correct default but needs documenting.
- **Neutral**, because `jig validate` (CLI, Plan 6) can surface the allowlist and flag helpers that reach outside it at lint time. Runtime denials still return `null`/`false` and don't throw.

## Confirmation

- Unit tests in `tests/helpers.test.ts` call `configureAccess` at module top with a fixture-scoped allowlist; existing present/missing/invalid tests remain green.
- New tests cover: path outside allow → `null`/`false`; path inside allow → the existing pass-through behavior; symlink escape via `fs.symlinkSync` → `null`/`false`; env name not in allow → `null`/`false`; `JIG_*` glob matches.
- Config tests in `tests/config.test.ts` cover: absent `security:` → defaults applied; explicit `security:` → honored; `$HOME` expansion; `~` expansion; unset `$VAR` in allow entry → parse error.
- Integration test (Plan 3 Phase 6) exercises an allowlisted path end-to-end through compute + guard + transform over stdio.
- `jig validate` (Plan 6) later adds a lint rule: helpers referencing paths with `{var}` inputs that the allowlist could not reasonably cover produce a warning.

## Pros and Cons of the Options

### A. Reject `..` segments in relative paths; leave absolute paths open

Only touch `resolveRelative` in `helpers.ts` to reject input containing `..`. Absolute paths remain passed through.

- Good, because the change is ~3 lines.
- Bad, because it misses the headline attack: `file.exists("/etc/passwd")` still works fine.
- Bad, because it invites future maintainers to believe "we addressed the path issue" — partial fixes with a security label are worse than no fix.

### B. Confined roots + `realpath` check + env allowlist (chosen)

The approach described above.

- Good, because it closes both the absolute-path and symlink-escape classes.
- Good, because it lifts the pattern from proven runtimes (Deno, systemd, Docker) rather than inventing a bespoke model.
- Good, because the env allowlist addresses a sibling vulnerability (env exfil) with the same machinery.
- Neutral, because adding a `security:` block is new schema surface. It is small, optional, and discoverable in one place.
- Bad, because Phase 2 of Plan 3 grows beyond its original plan. The alternative is shipping Phase 2 with a known hole and backfilling — rejected per the [feedback on not shipping day-one stale deps](../../.claude/…): don't ship day-one CVEs either.

### C. Per-tool access capabilities

Each `tools[i]` declares its own `access:` block listing allowed paths / env vars.

- Good, because granularity: a `list_configs` tool can declare `$HOME/.config` without opening that to every other tool.
- Bad, because it doubles the YAML surface and spreads security-relevant declarations across the file. Reviewers read a server's security posture in one place, not per-tool.
- Bad, because v1 doesn't need the granularity. When a real use case surfaces (multi-tenant tool bundles, untrusted-tool delegation), it can be added as a tool-level override that narrows — not widens — the server-level allowlist.

### D. Trust the author; document the risk in ADR-0008

Ship the helpers as-is; add a "don't do this" callout to ADR-0008's Safety Boundary.

- Good, because zero code change.
- Bad, because PHP settled this argument two decades ago. Junior authors write `include($_GET['page'])` and don't know to stop.
- Bad, because the MCP ecosystem is full of servers making this exact mistake today; jig has an opportunity to be correct by default instead of joining that list.

## More Information

- [ADR-0002: JSONLogic via `json-logic-engine`](0002-jsonlogic-via-json-logic-engine.md) — the engine these helpers register against.
- [ADR-0005: Sibling YAML from `import.meta.url`](0005-sibling-yaml-from-import-meta-url.md) — source of the `RUNTIME_ROOT` anchor used as the default allow root.
- [ADR-0006: Exec is shell-free](0006-exec-no-shell-whitespace-argv.md) — `exec:` remains the escape hatch for file-read cases the helpers refuse.
- [ADR-0008: JSONLogic built-in helpers](0008-jsonlogic-builtin-helpers.md) — the helpers this ADR confines. Does not supersede — extends.
- Design doc, "Templating: two layers" section: [`record/designs/2026-04-13-jig-design.md:141-168`](../designs/2026-04-13-jig-design.md).
- Plan 3, Phase 2 — carries the amendment implementing this ADR.
- Deno permissions model (`--allow-read=path,path`), for prior art.

Revisit when (a) a real use case demands per-tool granularity (supersede with a Plan-5+ ADR), (b) HTTP transport ships (Plan 7) and the threat model widens to network-reachable adversaries, or (c) a real secret-naming convention emerges that the default env allowlist should bless.
