---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0008: Built-in JSONLogic helpers — fixed set, read-only, no author extension

## Context and Problem Statement

Plan 3 introduces JSONLogic (per [ADR-0002](0002-jsonlogic-via-json-logic-engine.md)) as the conditional-logic layer for guards (`when:`), response transforms, `compute:` handlers, and probe `map:` steps. JSONLogic core operators cover comparisons, boolean logic, string/array ops, and arithmetic — they do not cover filesystem inspection, environment variable reads, or OS introspection. Authors routinely need those checks in guards: "only run this case if the config file exists," "only on macOS," "only when `$HOME` is set."

Without built-ins, authors have two options: drop to `exec:` with shell tests, or ask jig to grow an author-extensible operator API. Both are worse than shipping a curated set.

## Decision Drivers

- Guards run in the hot path; every `tools/call` may evaluate several. Helpers must be safe, fast, and side-effect-free.
- Bundle size matters — jig ships inside every built `.mjs`. The helper set should not grow beyond what authors actually need.
- An author-registration API for custom helpers reopens the "runtime-loaded extensions" surface [ADR-0004](0004-no-plugin-system-in-v1.md) rejected.
- The `exec:` handler already covers custom logic; the `compute:` handler (Plan 3) covers pure expressions. Helpers are for what those two can't gracefully express inline.
- Authors shouldn't need to learn two idioms for "check the environment" depending on where in the YAML they're writing.

## Considered Options

- **Fixed curated set across five namespaces (`file`, `env`, `path`, `os`, `time`)** (chosen)
- **Author-registered helpers via YAML declaration or JS shim**
- **Minimal set — only `file.exists` and `env.get`/`env.has`**
- **Expansive set — add `hash.*`, `base64.*`, `url.*`, `file.read_text`, `file.mtime`**
- **No built-ins — authors drop to `exec:` for any environment check**

## Decision Outcome

Chosen: **Fixed curated set across five namespaces.**

**v1 surface (16 helpers across five namespaces):**

- `file.exists`, `file.is_file`, `file.is_dir`, `file.size`
- `env.get`, `env.has`
- `path.join`, `path.resolve`, `path.dirname`, `path.basename`
- `os.platform`, `os.arch`, `os.homedir`, `os.tmpdir`
- `time.now`, `time.iso`

Full signatures and implementation order live in Plan 3.

**Safety boundary:**

- Inspect filesystem (existence, type, size) — not contents
- Read env vars
- Pure string ops on paths
- OS introspection (platform, arch, standard paths)
- Wall-clock time
- ✗ Read file contents — use `probes` (startup snapshot) or `exec:`
- ✗ Write anything — helpers have no mutation surface
- ✗ Spawn subprocesses — that's `exec:`
- ✗ Network — that's `probes`, `http:`, `graphql:`

Every "not allowed" case points to an existing handler that owns that class of work. The helper surface is deliberately the gap those handlers leave.

**Semantics:**

- Helpers never throw. Boolean helpers return `false` on failure; helpers that return values (strings, numbers) return `null`. A throwing helper in a `when:` guard poisons the dispatch decision and surfaces as an MCP protocol error rather than "this case didn't match."
- Registered against the **async** `json-logic-engine` per [ADR-0002](0002-jsonlogic-via-json-logic-engine.md). One engine, one evaluation model, regardless of whether a specific helper is internally sync.
- Relative paths resolve from `dirname(fileURLToPath(import.meta.url))` — same rule as [ADR-0005](0005-sibling-yaml-from-import-meta-url.md) for sibling YAML. Absolute paths pass through unchanged.
- Names use `namespace.snake_case` — matches the `queue.length` example in the design doc (`record/designs/2026-04-13-jig-design.md:161`) and the Unix-tool feel of `is_file`.

### Consequences

- Good, because the five namespaces cover the guard cases `exec:` would otherwise handle with shell tests (`test -f`, `test -n "$VAR"`, `uname -s`).
- Good, because "helpers are a fixed set" is a straightforward documentation surface — listed in one place, versioned with jig.
- Good, because ruling out file reads, writes, subprocess, and network keeps guards fast and safe. The separation of concerns matches the existing handler split.
- Good, because names share a convention with the JSONLogic example in the design doc — nothing looks bolted on.
- Bad, because authors who want a helper jig doesn't ship have to wait for a version bump or fall back to `exec:`. There is no plugin escape hatch for helpers.
- Bad, because future growth of the set (v0.2 transforms might want `hash.sha256`) requires either an ADR update or a superseding ADR.
- Bad, because the "never throw" rule hides errors — a typo in a path produces silent `false`, not a loud failure. Mitigation: `jig validate` can flag unknown helper names at lint time; runtime invocation errors log to stderr even when the return value is `null`.

### Confirmation

- Unit tests per namespace covering: present/missing/invalid inputs, platform variations where relevant, never-throws on garbage input.
- Integration test: a dispatch case with `when:` referencing `file.exists` against a sibling fixture — verified to fire and not fire with and without the file present.
- `jig validate` extended to check that helper names appearing in JSONLogic expressions match the known set.

## Pros and Cons of the Options

### Fixed curated set across five namespaces

Ship `file`, `env`, `path`, `os`, `time` as the v1 surface. 16 helpers total. No author registration. Authors who need more use `exec:` or propose an addition for v0.2.

- Good, because the scope is bounded and every helper's semantics are auditable in one file
- Good, because it matches the design's bias toward declarative YAML with an `exec:` escape hatch
- Good, because "what can I call?" has a finite answer authors can print out
- Neutral, because any gap requires a release — v0.2 can add a sixth namespace without breaking v0.1 YAML
- Bad, because the surface can't evolve faster than jig's release cadence

### Author-registered helpers via YAML declaration or JS shim

Authors declare something like `helpers: { my_check: { js: ./my-check.mjs } }` and register custom logic, or drop a `handlers/` directory of JS shims.

- Good, because authors can extend the surface without waiting for jig
- Bad, because it reopens the plugin-loading surface [ADR-0004](0004-no-plugin-system-in-v1.md) closed
- Bad, because it breaks single-file deployment — authors ship a sibling JS module
- Bad, because it duplicates `exec:` and `compute:`, which already cover custom logic

### Minimal set — `file.exists` + `env.get`/`env.has` only

Three helpers. Only what the stated motivation ("check file existence in a guard") demands.

- Good, because YAGNI — ship nothing speculative
- Bad, because the first "only on macOS" check needs `os.platform` and authors drop back to `exec:`. That's the same class of problem as `file.exists`; excluding it draws an arbitrary line.
- Bad, because `path.join` / `path.resolve` almost always accompany `file.exists` (checking `$HOME/config/foo`) and leaving them out forces string concatenation in YAML

### Expansive set — add `hash.*`, `base64.*`, `url.*`, `file.read_text`, `file.mtime`

Adds roughly ten more helpers for hashing, encoding, content reads, and richer stat.

- Good, because transforms and `compute:` in Plan 3+ may eventually want hashing and encoding
- Bad, because none of those are guard-shaped. They're response-shaping utilities better added when a real `transform:` use case surfaces.
- Bad, because `file.read_text` is *specifically* wrong as a helper — that's what `probes` are for. A helper that reads file contents on every `tools/call` pushes authors toward unbounded I/O in the hot path.

### No built-ins — `exec:` for everything

Authors who need to check the environment drop to `exec: test -f /path` or similar.

- Good, because the helper surface stays at zero
- Bad, because every guard gains a subprocess spawn — measurable overhead at scale
- Bad, because [ADR-0006](0006-exec-no-shell-whitespace-argv.md) commits to shell-free exec; `test` and friends require real shell semantics or a bundled helper binary
- Bad, because it undermines the declarative-YAML value proposition: authors reading a jig config shouldn't have to know shell

## More Information

- [ADR-0002: JSONLogic via `json-logic-engine`](0002-jsonlogic-via-json-logic-engine.md) — the engine these helpers register against
- [ADR-0004: No plugin system in v1](0004-no-plugin-system-in-v1.md) — precedent for "no author extension API"
- [ADR-0005: Sibling YAML from `import.meta.url`](0005-sibling-yaml-from-import-meta-url.md) — same path-resolution rule
- [ADR-0006: Exec is shell-free](0006-exec-no-shell-whitespace-argv.md) — why `test -f` in `exec:` doesn't cover this ground
- [ADR-0007: Mustache minimal](0007-mustache-minimal-string-only.md) — parallel "minimal surface" decision
- Design doc, "Templating: two layers" section: [`record/designs/2026-04-13-jig-design.md:141-168`](../designs/2026-04-13-jig-design.md)
- Plan 3 (to be written): `record/plans/YYYY-MM-DD-jig-runtime-plan3.md` carries the full helper signatures and implementation order

Revisit when a real `transform:` or `compute:` use case demands hashing, encoding, or content reads — at that point, publish a superseding ADR rather than editing this one.
