---
status: proposed
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0011: `${VAR}` shim expands into JSONLogic inside connection strings

## Context and Problem Statement

Connection headers need a readable way to interpolate environment variables — most commonly an auth token:

```yaml
connections:
  linear_api:
    url: https://api.linear.app/graphql
    headers:
      Authorization: "Bearer ${LINEAR_API_TOKEN}"
```

Two templating layers already live in the runtime: Mustache ([ADR-0007](0007-mustache-minimal-string-only.md)), scoped deliberately to exec argv rendering against tool-call args; and JSONLogic ([ADR-0002](0002-jsonlogic-via-json-logic-engine.md), [ADR-0008](0008-jsonlogic-builtin-helpers.md)), the evaluation substrate for guards, compute handlers, transforms, and helpers including `env.get`. The jig design doc (2026-04-13) sketched `${env.LINEAR_API_TOKEN}` as a third dedicated syntax, but that draft predates the JSONLogic helper shelf.

The question: **what syntax should authors use to read environment variables into connection values, and which templating layer should own that resolution?**

## Decision Drivers

- **Three templating layers is too many.** Authors already track where Mustache applies (exec argv, handler fields in Plan 4) and where JSONLogic applies (compute, when, transform, connection values). A third distinct grammar would fragment the mental model without adding capability.
- **Access control already exists.** `env.get` passes through ADR-0009's env allowlist. A new `${env.X}` parser would either duplicate that check or bypass it — both bad outcomes.
- **The common case should read clearly.** `"Bearer ${TOKEN}"` is five words the reader can scan in one glance. `{"cat":["Bearer ", {"env.get":["TOKEN"]}]}` is noise for the 90% case.
- **ADR-0007's minimality is load-bearing.** Mustache stays string-only, args-only. Extending it to read `process.env` would pull responsibility away from the access-controlled helper surface and into a parser that doesn't know about the allowlist.
- **Authors should be able to reach JSONLogic when they need to.** Not every connection value is `Bearer ${TOKEN}`. Some compose paths; some conditionally include headers. The shim must not prevent the full JSONLogic surface from being available underneath.

## Considered Options

- **A. Keep `${env.VAR}` as a dedicated new syntax** with its own parser and its own allowlist wiring.
- **B. Extend Mustache to support env reads** — `{{env.LINEAR_API_TOKEN}}` alongside arg substitution.
- **C. Pure JSONLogic with no sugar** — authors write `{"env.get": ["X"]}` everywhere.
- **D. `${VAR}` shim that expands into JSONLogic at config load** (chosen).

## Decision Outcome

Chosen: **D. `${VAR}` in string values under `connections:` is syntactic sugar. At config-load time, a pre-pass expands each `${VAR}` occurrence into a JSONLogic `{"env.get": ["VAR"]}` rule and wraps the surrounding string with `cat`.**

### Expansion rule

A connection-scoped pre-pass walks every string value under `connections:` (URL, header values, timeout when string-typed, future fields). For each string:

- No `${...}` tokens → keep as a literal string. The handler or fetch wrapper uses it verbatim.
- One or more `${VAR}` tokens → split the string on every `${...}` boundary, replace each token with `{"env.get": ["VAR"]}`, wrap the resulting sequence in `{"cat": [...]}`. A lone `${VAR}` with no surrounding text simplifies to just the `env.get` rule.

Example expansions:

```yaml
# Input
"Bearer ${LINEAR_API_TOKEN}"
# Output
{"cat": ["Bearer ", {"env.get": ["LINEAR_API_TOKEN"]}]}

# Input
"${JIG_PROTOCOL}://${JIG_HOST}:${JIG_PORT}"
# Output
{"cat": [
  {"env.get": ["JIG_PROTOCOL"]},
  "://",
  {"env.get": ["JIG_HOST"]},
  ":",
  {"env.get": ["JIG_PORT"]}
]}

# Input
"${LINEAR_API_TOKEN}"
# Output
{"env.get": ["LINEAR_API_TOKEN"]}
```

`${VAR}` tokens use the same name rule as shell: `[A-Za-z_][A-Za-z0-9_]*`. Malformed tokens (`${1BAD}`, unclosed `${`) are passed through literally — the shim does not throw; it just doesn't expand tokens it doesn't recognize. Authors who need a literal `${name}` in a header value can write explicit JSONLogic to produce that string.

### Scope

The shim applies **only** to string values under `connections:`. Specifically:

- Yes: `connections.X.url`, `connections.X.headers.*`, `connections.X.timeout_ms` (when authored as a string), `connections.X.*` (future fields)
- No: handler fields (`http.path`, `http.body`, `http.headers`, `graphql.query`, `graphql.variables`) — those are Mustache-rendered against tool-call args per Plan 4's design
- No: `tools[].description`, `server.description`, any other string in the YAML
- No: `compute:`, `when:`, `transform:` rules — those are already JSONLogic and don't need a sugar layer

The pre-pass runs once at config load. Every expanded rule is then an ordinary JSONLogic AST that the existing engine evaluates per-request when connection headers fire.

### Access control

Expansion lands `env.get` inside the rule. When the rule evaluates, `env.get` hits [ADR-0009](0009-path-and-env-confinement-for-helpers.md)'s `isEnvAllowed` check. `${LINEAR_API_TOKEN}` therefore requires `LINEAR_API_TOKEN` to match `server.security.env.allow` (or a default pattern — `LINEAR_*` is not in defaults, so authors declare it).

A missing env var returns `null` from `env.get`, per ADR-0008. `cat` then stringifies `null` into the header value. Authors who need "fail closed when missing" can call `env.required` explicitly (an ADR-0008 helper that throws on miss) — but they write that rule directly rather than through the `${}` shim, because the shim is sugar for the common case only.

## Consequences

- **Good**, because the common case — `Bearer ${TOKEN}` — reads like a shell heredoc. Authors don't learn a new grammar.
- **Good**, because the shim adds zero runtime surface. Expansion runs once at config load; the evaluator sees a standard JSONLogic AST afterward.
- **Good**, because ADR-0009's env allowlist applies automatically. No second access-control path to maintain.
- **Good**, because authors who need more than env lookup (path composition, conditional headers) write explicit JSONLogic at the same spot. The shim does not prevent power.
- **Good**, because the shim is one small file (`src/runtime/util/interpolate.ts`) with a focused test surface.
- **Bad**, because `${VAR}` means different things in different parts of the YAML: env expansion inside `connections:`, the literal string `${VAR}` inside handler `path:` or `query:` (Mustache uses `{{var}}`). The README and author-facing docs have to explain the boundary.
- **Bad**, because a handler with a one-off `url:` (no `connection:` block) sits outside `connections:` and does not get the shim. Authors who want env-based URL composition on one-off handlers write explicit JSONLogic or declare a connection.
- **Bad**, because the shim can silently produce a header like `"Bearer null"` when an allowed-but-unset env var is read. The behavior matches the rest of the JSONLogic helper contract (never throw, return null/false) but can surprise authors debugging auth. Mitigation: `jig validate` (Plan 6) surfaces any env var referenced from a connection but not present in the environment at validation time.
- **Neutral**, because a future ADR could expand the shim's scope to other blocks (probes, state-machine actions) if real use cases appear. Starting narrow is cheap to widen.

## Confirmation

- Unit tests in `tests/interpolate.test.ts` cover: no-token passthrough, single-token simplification to bare `env.get`, multi-token `cat` wrapping, malformed-token literal passthrough, escape-free literal `$` characters, unicode in literal segments.
- Config tests in `tests/config.test.ts` cover: shim ran over `connections:` subtree only (handler fields unchanged), shim produces valid JSONLogic AST the existing engine accepts.
- Handler tests in `tests/handlers.test.ts` cover: connection header with expanded `env.get` denied by ADR-0009 allowlist → `isError` with the env-denial message; connection header with allowed env var resolves to the expected token at fetch time.
- Integration test (Plan 4 Phase 7) exercises an end-to-end call that reads a test-fixture env var into an Authorization header via `${VAR}`.

## Pros and Cons of the Options

### A. Dedicated `${env.VAR}` syntax with its own parser

A new grammar alongside Mustache and JSONLogic. Its own allowlist wiring.

- Good, because it matches the original design-doc sketch verbatim.
- Bad, because it duplicates `env.get` + ADR-0009 access control in a second code path.
- Bad, because authors learn three templating layers instead of two.
- Bad, because extending it to new helpers (`${file:/tmp/creds}`, `${vault:secret}`) would require re-inventing JSONLogic piece-by-piece.

### B. Extend Mustache to support env reads

`{{env.LINEAR_API_TOKEN}}` alongside `{{name}}` in Mustache renders.

- Good, because one fewer grammar.
- Bad, because ADR-0007 deliberately holds Mustache to args-only, string-only substitution. The minimality is load-bearing — expanding scope breaks the "Mustache does one thing" contract.
- Bad, because Mustache has no access-control hook. Either a parallel check lives in the renderer (duplication) or Mustache-env reads bypass the allowlist (regression).
- Bad, because Mustache in Plan 4 handlers still renders against tool args. Authors would have to remember that `{{env.X}}` works only in certain places.

### C. Pure JSONLogic with no sugar

Every env read in connections is `{"env.get": ["X"]}` or `{"cat": [...]}`.

- Good, because it's the most rigorous and uniform.
- Good, because it requires zero additional code.
- Bad, because `"Bearer ${TOKEN}"` becomes noise in the most common connection header. Every jig.yaml that touches an authed API pays the tax.
- Bad, because YAML's inline JSON quoting makes the multi-line form verbose enough that authors reach for raw HTTP libraries or write ad-hoc wrappers.

### D. `${VAR}` shim expanding to JSONLogic (chosen)

The approach described above.

- Good, because it gives authors the readable common case while keeping JSONLogic as the evaluation substrate.
- Good, because the shim is entirely compile-time — zero runtime cost, standard AST flows through the rest of the engine.
- Good, because ADR-0009 access controls apply automatically.
- Neutral, because authors now learn two interpolation syntaxes: `${VAR}` in connection strings, `{{var}}` in handler strings. The rule is "sugar where config lives, Mustache where calls happen" — teachable in one paragraph.
- Bad, because it's a second surface to document. See bads above.

## More Information

- [ADR-0002: JSONLogic via `json-logic-engine`](0002-jsonlogic-via-json-logic-engine.md) — the substrate the shim expands into.
- [ADR-0007: Mustache minimal, string-only](0007-mustache-minimal-string-only.md) — the layer this ADR deliberately avoids extending.
- [ADR-0008: JSONLogic built-in helpers](0008-jsonlogic-builtin-helpers.md) — `env.get` is the expansion target; `env.required` is available to authors who need miss-throws.
- [ADR-0009: Path and env confinement for helpers](0009-path-and-env-confinement-for-helpers.md) — the allowlist every expanded `env.get` call hits.
- [ADR-0010: Network host confinement](0010-network-host-confinement.md) — the other Plan 4 security ADR; together they define the v1 connection surface.
- [Design doc: Plan 4 — connections, http, graphql](../designs/2026-04-14-plan4-connections-http-graphql.md) — the narrative context.
- Plan 4 Phase 2 lands `src/runtime/util/interpolate.ts` implementing this ADR.

Revisit when (a) real author patterns want the shim in other blocks (probes, state-machine actions), (b) a helper beyond `env.get` becomes the dominant case in connection values (vault/keychain reads — in which case a `${scheme:arg}` extension becomes interesting), or (c) users repeatedly request a way to escape literal `${...}` strings in header values.
