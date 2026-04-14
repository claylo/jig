# Plan 4 — connections, http, graphql

**Date:** 2026-04-14
**Status:** Draft

## Overview

Plan 4 adds outbound network access to the jig runtime through three new surfaces: a `connections:` block that names upstream endpoints once, an `http:` handler that consumes them, and a `graphql:` handler that layers GraphQL semantics on top. Probes — startup-time data fetches that surface values throughout the YAML — defer to Plan 5 so we can lock the network-handler shape before deciding how probes expose results.

## Context

Plans 1–3 gave the runtime everything it needs to respond to MCP calls with local side effects: inline text, exec processes, dispatcher routing, and JSONLogic-backed compute/guards/transforms over `file.*`, `env.*`, `path.*`, `os.*`, and `time.*` helpers. None of those reach the network. ADR-0008 ruled network access out of the helper surface explicitly so that helpers stay pure and predictable.

Real MCP servers need to talk to HTTP APIs. The motivating use case — a streamlinear-style Linear MCP — is a dispatcher tool whose cases POST GraphQL queries to `api.linear.app/graphql` with a bearer token. The design doc (2026-04-13, §Connections and probes) sketches the shape: `connections:` as a map of named URL + headers, handlers reference them by name, and probes run at boot to cache values like a team list that can be interpolated into tool descriptions.

The constraints shaping Plan 4:

- **Credentials are the highest-risk surface.** An MCP server that leaks a Linear token or GitHub PAT is an exfiltration vector. ADR-0009 established deny-by-default path + env confinement for helpers. Plan 4 extends that posture to network hosts.
- **Node 22+ ships `fetch` in the standard library.** Adding a third-party HTTP client would break jig's single-file-no-deps promise. We use built-in `fetch` with `AbortSignal` for timeouts.
- **Plans 1–3 established two resolution layers already.** Mustache for imperative string substitution (ADR-0007, exec argv), JSONLogic for declarative value evaluation (ADR-0002, ADR-0008). Adding a third syntax would fragment the mental model; we extend the two we have.
- **Config is declarative; handler invocations are imperative.** Connection values resolve in the declarative frame; handler fields resolve in the imperative frame. The split informs which templating layer applies where.

## Approach

### Schema additions

Two new top-level concerns land in `jig.yaml`:

```yaml
server:
  name: ...
  security:
    filesystem: { allow: [...] }         # ADR-0009
    env:        { allow: [...] }         # ADR-0009
    network:
      allow: ["api.linear.app", "*.github.com"]   # optional

connections:
  linear_api:
    url: https://api.linear.app/graphql
    headers:
      Authorization: "Bearer ${LINEAR_API_TOKEN}"
    timeout_ms: 30000                    # optional, default 30000

tools:
  - name: linear
    handler:
      graphql:
        connection: linear_api
        query: "{{query}}"
        variables:
          id: "{{id}}"
```

`connections:` is a sibling map to `server:` and `tools:`. Each entry declares a base URL, an optional header map, and an optional per-connection timeout. `server.security.network.allow` extends ADR-0009's security block with a host allowlist.

### `http:` handler

```yaml
handler:
  http:
    connection: github_api               # required unless `url:` is set
    method: GET | POST | PUT | PATCH | DELETE
    path: "/repos/{{owner}}/{{repo}}"    # Mustache-rendered, appended to connection URL
    url: "https://..."                   # escape hatch; bypasses connection URL
    query:                               # string-to-string, Mustache-rendered, URL-encoded
      per_page: "30"
    headers:                             # merged over connection.headers; handler wins
      X-Request-Id: "{{req_id}}"
    body:                                # YAML mapping → JSON, or string → raw
      title: "{{title}}"
      labels: ["{{label}}", "triage"]
    response: body | envelope            # default "body"
    timeout_ms: 5000                     # overrides connection.timeout_ms
```

`body:` as a mapping serializes to JSON with `Content-Type: application/json` applied automatically; string leaves pass through Mustache before serialization. `body:` as a string sends that string verbatim, and the author sets the content type via `headers:`.

When `url:` is used without `connection:`, headers come from the handler's `headers:` map alone — there is no connection to merge from, so auth and defaults must be inline. The host still has to pass the network allowlist (see Access control below), so authors using one-off URLs declare the host in `server.security.network.allow` explicitly.

### `graphql:` handler

```yaml
handler:
  graphql:
    connection: linear_api               # required
    query: |                             # Mustache-rendered
      query GetTeam($id: String!) { team(id: $id) { name } }
    variables:                           # YAML mapping → JSON, Mustache on string leaves
      id: "{{team_id}}"
    response: data | envelope            # default "data"
    timeout_ms: 10000
```

GraphQL always posts to the connection URL. A 200 response with a non-empty `errors:` array becomes `isError: true` with the first error message. `data:` is extracted as the result when errors are absent. Authors who need the raw shape (partial data + errors) opt into `response: envelope`.

### Response shape

The default result delivered to `applyTransform` is the response body — already the contract Plan 3's transforms expect. `tryParseJson` picks up JSON bodies transparently. For HTTP, 4xx/5xx responses flip `isError: true` with `http: <method> <url> returned <status>: <body>`; network errors and timeouts produce `isError: true` with a descriptive message.

Envelope mode promotes the result to `{status, headers, body}` (HTTP) or `{data, errors, extensions}` (GraphQL). Status-code auto-errors do not apply in envelope mode; the author handles branching.

### Value resolution

Plan 4 introduces one new sugar and reuses the two existing resolution layers:

**`${VAR}` shim (new, connection-scoped).** During config load, a pre-pass walks every string under `connections:` and expands `${VAR}` tokens into JSONLogic AST: `"Bearer ${LINEAR_API_TOKEN}"` becomes `{"cat": ["Bearer ", {"env.get": ["LINEAR_API_TOKEN"]}]}`. Strings without `${...}` stay literal. The shim does nothing outside `connections:` — handler fields still use Mustache, compute/when/transform still use explicit JSONLogic.

**JSONLogic (Plan 3, connection values).** Connection values are JSONLogic rules. The `${VAR}` shim is syntactic sugar; authors who need more than env lookup write the rule directly. `env.get` inside any connection header still passes through ADR-0009's env allowlist.

**Mustache (Plan 2, handler fields).** String-leaf Mustache substitution against tool-call args applies to `path`, `url`, `query` values, `headers` values, `body` string leaves, `query` (graphql), and `variables` string leaves. Structural YAML — method, response mode, timeouts, connection name — is not templated.

### Resolution timing

- `connection.url`: resolved once at boot. Must evaluate to a string.
- `connection.timeout_ms`: resolved once at boot.
- `connection.headers`: compiled to JSONLogic rules at boot; evaluated per-request. Microsecond cost; keeps time-based or rotating values correct.
- Handler fields: Mustache-rendered per-request against tool args.

### Access control: network extension

`src/runtime/util/access.ts` grows a parallel structure to env confinement. `configureAccess` accepts the parsed `connections:` block alongside the existing security config. One new public function:

```typescript
export function isHostAllowed(hostname: string): boolean;
```

Behavior:

- If `server.security.network.allow` is set, its glob patterns compile into the allow list.
- If unset and `connections:` declares any entries, the allow list is the set of hosts parsed from each connection's `url`.
- If unset and no connections are declared, the allow list is empty — every host denies. A handler with a one-off `url:` cannot reach an arbitrary host without an explicit declaration.
- Matches use the same `*`-only glob compiler that env patterns use (per ADR-0009).

Every outbound request calls `isHostAllowed(new URL(fullUrl).hostname)` before `fetch`. Deny produces `isError: true` with `http: host "x.com" not in server.security.network.allow`.

### Boot sequence

`src/runtime/index.ts` grows four steps between config load and server start:

1. Load config YAML (existing).
2. Run the `${VAR}` shim pre-pass over the `connections:` subtree.
3. Call `configureAccess(config.server.security ?? {}, runtimeRoot, config.connections)`. This populates the host allowlist from connection URLs when unset.
4. Compile each connection's headers into cached JSONLogic rules.
5. Sanity-check: every connection URL's host passes `isHostAllowed`. Fails fast when an author sets `network.allow` that excludes their own connection.
6. Hand off to server startup (existing).

### File layout

```
src/runtime/
  connections.ts              — schema parsing, URL inference for allowlist, per-request header resolution
  handlers/
    http.ts                   — http handler: method/path/query/body/headers, response modes, error normalization
    graphql.ts                — graphql handler: query/variables, error auto-detect, response modes
  util/
    interpolate.ts            — ${VAR} → JSONLogic pre-pass for strings in connections
    fetch.ts                  — fetch wrapper: host check, timeout via AbortSignal, envelope construction

  config.ts                   — + ConnectionsConfig, NetworkSecurity
  util/access.ts              — + isHostAllowed, configureAccess accepts connections
  handlers/index.ts           — + http/graphql wired into invoke() union
  index.ts                    — boot sequence extensions above
```

## Alternatives considered

### Connection schema

- **Full-URL-per-connection, no path composition.** Simpler for GraphQL (single endpoint) but forces HTTP authors into one connection per path or pushes full URLs into every handler. We reject this because it destroys the "declare upstream once" ergonomic.
- **Headers-only connections (no URL).** Every handler provides the full URL. Maximally flexible, but repeats hostnames across handlers talking to the same service and invites drift. The base-URL-plus-path shape matches how most HTTP clients and CLI tools model remotes; we stay with the convention.

### Value resolution

- **Keep `${env.VAR}` as a dedicated new syntax.** The design doc's original sketch. We reject a third templating layer after Mustache and JSONLogic; it would fragment the mental model and duplicate access control already covered by ADR-0009's env allowlist.
- **Reuse Mustache for connection values (`{{env.VAR}}`).** Low churn. We reject because ADR-0007 deliberately holds Mustache to minimal string-only substitution against args; extending it to read process env pulls responsibility away from the access-controlled helper layer.
- **Pure JSONLogic with no `${VAR}` sugar.** Rigorous and works today. We reject pragmatically: `{"cat":["Bearer ", {"env.get":["TOKEN"]}]}` is noisy for the 90% case. The shim keeps the common case readable while the underlying substrate stays uniform.

### Handler field resolution

- **JSONLogic for handler fields too.** Uniform. We reject because handler fields are imperative — they run per-call against tool-call args — and Mustache already covers that case with ADR-0007. Paths and query values are string replacement; the string-replacement layer is Mustache.

### Network confinement

- **No network allowlist (match exec's permissive model).** Simplest. We reject because exec hands the OS a process with the server's privileges — a known "if you trust the YAML, you trust the commands" contract. Outbound network from a declarative config is a different ergonomic; authors expect `connections:` to be the full list of reachable hosts, not a suggestion.
- **Explicit opt-in via `security.network.allow` only (default allow).** Author-controlled. We reject because the deny-by-default posture from ADR-0009 is cheaper in the happy path than explicit allowlists — declaring a connection already names the host.
- **Per-connection `allow:` lists.** Redundant with connection URLs. We reject because the URL is the declaration; duplicating it invites drift.

### Response shape

- **Envelope always (`{status, headers, body}`).** Uniform but forces `.body` indirection through every transform. We reject because 99% of tools want the body and Plan 3's transform parses JSON bodies transparently; envelope is the opt-in escape hatch.
- **Body-only, status-agnostic.** Skip auto-errors, let every transform branch on status. We reject because error propagation through `isError: true` is how Plans 1–3 signal failure, and silently returning 404 bodies as success would break dispatcher + `when:` guard composition.

### HTTP client

- **Third-party library (ureq-style, undici, ky).** Richer feature sets — retries, connection pooling, interceptors. We reject because jig's single-file-no-deps promise is load-bearing, Node 22+ `fetch` covers the v1 surface, and retries are cleanly expressible via `dispatch:` + `compute:` when needed.

## Consequences

**What we gain:**

- A first-class story for any MCP server that talks to a JSON or GraphQL API. The streamlinear-style Linear MCP becomes a ~30-line `jig.yaml`.
- Uniform security posture across filesystem, env, and network. One mental model for authors: declare what you touch; unset means deny-by-default.
- No new templating layer. Mustache and JSONLogic stay authoritative; `${VAR}` is syntactic sugar over the latter.
- Node stdlib `fetch` keeps the build small — no new runtime dependency.
- GraphQL's error shape is auto-detected, so authors who compose GraphQL results with `transform:` get the same ergonomics as a REST call.

**What we lose:**

- No retries in v1. Authors who need them wrap via `dispatch:` + `compute:`, which is more ceremony than an `http: { retries: 3 }` field. If user traffic demands it, add in a point release.
- No form-urlencoded, HEAD, OPTIONS, or TRACE. Real ones are planned follow-ups (HEAD + OPTIONS) once v1 lands; TRACE is unlikely to return.
- No streaming. Not a loss today — MCP text blocks aren't streaming-friendly — but a constraint to remember when server-sent events become a use case.
- The envelope-mode opt-in costs a named parameter that authors must remember. Not free.
- `${VAR}` shim is a second surface to document — even if it's thin. Authors have to learn it alongside Mustache to fully read a `jig.yaml`.

**What we defer:**

- **Probes (Plan 5).** The lifecycle surface — "startup-time helper invocations" vs. "async-refresh track" vs. "`{{probe.NAME}}` as a Mustache extension" — is a design call that depends on how the network handler shape settles. Probes consume http/graphql handlers at startup; locking the handler shape first keeps probes a pure consumer.
- **HEAD and OPTIONS methods.** Expected to land; not v1.
- **Form-urlencoded body, multipart.** Add `body: { form: {...} }` or `body: { multipart: [...] }` when users ask.
- **Retries, connection pooling, keep-alive tuning.** fetch defaults are fine; revisit when production data says otherwise.
- **TLS client certs, mTLS, OAuth flows.** `--with-oauth` is a v0.2/v0.3 item per the jig design doc.
- **Extension point: `connections: merge`.** Deferred until sibling-YAML composition lands (not a Plan 4–6 item).

## Related decisions

Two ADRs capture the discrete decisions inside this design:

- [ADR-0010 — network host confinement](../decisions/0010-network-host-confinement.md) — extends ADR-0009's deny-by-default pattern to outbound hosts. Glob allowlist, inference from `connections:` when unset, deny-all when no connections are declared.
- [ADR-0011 — `${VAR}` shim for connection strings](../decisions/0011-var-shim-for-connection-strings.md) — sugar that expands `${VAR}` into `{"env.get":["VAR"]}` at config load, scoped to `connections:` only, leaving Mustache authoritative for handler fields.

Related prior decisions:

- [ADR-0002 — JSONLogic via json-logic-engine](../decisions/0002-jsonlogic-via-json-logic-engine.md)
- [ADR-0007 — Mustache minimal, string-only](../decisions/0007-mustache-minimal-string-only.md)
- [ADR-0008 — JSONLogic built-in helpers](../decisions/0008-jsonlogic-builtin-helpers.md)
- [ADR-0009 — path and env confinement for helpers](../decisions/0009-path-and-env-confinement-for-helpers.md)
