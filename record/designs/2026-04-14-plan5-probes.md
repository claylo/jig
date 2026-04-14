# Plan 5 — probes

**Status:** approved 2026-04-14
**Builds on:** Plan 4 (connections, http, graphql), ADR-0009 (path/env confinement), ADR-0010 (network confinement)

## Overview

Probes are startup-time data fetches whose results are exposed throughout a jig server's YAML as `{{probe.NAME}}` (Mustache) or `{ "var": "probe.NAME" }` (JSONLogic). They cover the streamlinear pattern: fetch teams, workflow states, repo info, or any other slow-changing upstream data once at boot, then reference the results from tool descriptions, command lines, request bodies, guards, and transforms — without re-fetching on every tool call.

Plan 5 lands the schema, the boot resolver, and the context wiring. Refresh and reload are out of scope for v1.

## Context

Plan 4 gave authors `connections:`, `http:`, and `graphql:` — they can now call upstreams from tool handlers. But the call happens at request time, against the agent's args. There's no way to pull a small bag of upstream-derived facts into a tool description ("Active teams: Engineering, Design, Ops") or to thread "current AWS account" / "current git SHA" through every tool's behavior.

Probes are that missing layer. The design-doc target use case is `streamlinear`: fetch the user's Linear teams + workflow states at boot, bake them into the dispatcher tool's description, and use them in `transform:` to label issues. The same shape covers `git rev-parse HEAD`, `aws sts get-caller-identity`, environment captures, and any other "boot once, read everywhere" data.

## Approach

### Schema additions

A new optional top-level `probes:` block:

```yaml
probes:
  NAME:                       # any string; becomes {{probe.NAME}}
    # Exactly one of these handler keys (network or exec):
    graphql:    { connection: ..., query: ..., variables?: ... }
    http:       { connection: ..., method: ..., path?: ..., ... }
    exec:       "command --flag"

    map: { ... }              # optional JSONLogic over the raw handler
                              # response. If omitted, the probe value
                              # is the raw handler text (string).

    timeout_ms: 30000         # optional; default 30000ms
```

**Validation rules** (`src/runtime/probes.ts`):
- Each entry must declare exactly one of `graphql:` / `http:` / `exec:`. `inline:`, `compute:`, `dispatch:` are rejected — see *Alternatives considered*.
- `map:` is optional; when present, accepted as arbitrary JSON. Structural validation is deferred to evaluation time, matching the existing `compute:` validator convention. Bad JSONLogic surfaces as a probe failure at boot.
- `timeout_ms:` is optional, must be a positive number, defaults to 30000.
- Unknown keys are rejected (matches the convention from `validateHttp` and `validateConnections`).
- Probe names must be valid Mustache path segments — alphanumeric plus `_`, no dots or spaces.

**Type definitions** (`src/runtime/config.ts`):

```typescript
export type ProbeHandler = GraphqlHandler | HttpHandler | { exec: string };

export interface ProbeSpec {
  handler: ProbeHandler;
  map?: JsonLogicRule;
  timeout_ms?: number;
}

export type ProbesConfig = Record<string, ProbeSpec>;
```

### Boot resolver

A new `resolveProbes(probes, compiledConnections)` function in `src/runtime/probes.ts`:

```typescript
export async function resolveProbes(
  probes: ProbesConfig | undefined,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<Record<string, unknown>>;
```

Behavior:

1. If `probes` is undefined or empty, return `{}`.
2. Build a `Promise[]` of probe resolutions — one promise per probe, kicked off via `Promise.allSettled` so a single failure doesn't cancel the others. The intent is to report ALL failures in one stderr block, not just the first.
3. Per-probe resolution:
   - Build the handler's eval context with empty `args` and empty `probe` (probes can't reference probes — see *Concurrency* below).
   - Dispatch through the existing `invoke()` with an `InvokeContext` that has `connections` from boot and `probe: {}`.
   - Wrap in `Promise.race` against `setTimeout(reject, timeout_ms)` for the per-probe timeout.
4. If the handler returns `isError: true`, treat as probe failure.
5. If `map:` is set, evaluate the JSONLogic rule against `{ result }` (where `result` is the parsed-or-raw handler response — try `JSON.parse` first, fall back to the raw string). Map evaluation errors are probe failures.
6. After `Promise.allSettled`, collect failures. If any failed, write a single stderr block listing every failed probe with its reason, then `process.exit(1)`. The MCP server does not start.
7. Return `Record<string, unknown>` mapping probe name → resolved value.

**Error message format** (one stderr block; multiple failures are enumerated):

```
jig: probe resolution failed for 1 probe (server will not start):

  probe "teams":
    graphql request to https://api.linear.app/graphql timed out after 30000ms
```

**Exit code:** 1.

### Boot sequence integration

Existing `src/runtime/server.ts` boot order (parse config → register tools → start stdio transport) extends to:

```
parse config
→ compileConnections(config.connections)              # existing
→ configureAccess(connections, security)              # existing
→ resolveProbes(config.probes, compiledConnections)   # NEW
→ register tools (now with InvokeContext.probe)       # existing, ctx extended
→ start stdio transport                               # existing
```

Probe resolution runs after access is configured (so `isHostAllowed` rejects out-of-policy upstream calls in probes) and before tool registration (so tool descriptions can interpolate `{{probe.X}}` at `tools/list` time).

### Context wiring (Mustache + JSONLogic)

`InvokeContext` in `src/runtime/handlers/index.ts` gains a single field:

```typescript
export interface InvokeContext {
  connections: Record<string, CompiledConnection>;
  probe: Record<string, unknown>;          // NEW; empty {} when no probes declared
}
```

Every existing call site that builds a Mustache or JSONLogic context merges `probe` in:

| Call site | Engine | Context today | Context after Plan 5 |
|---|---|---|---|
| `handlers/exec.ts` — render command line | Mustache | `args` | `{ ...args, probe }` |
| `handlers/http.ts` — render path / query / body | Mustache | `args` | `{ ...args, probe }` |
| `handlers/graphql.ts` — render query / variables | Mustache | `args` | `{ ...args, probe }` |
| `handlers/dispatch.ts` — `when:` evaluation | JSONLogic | `args` | `{ ...args, probe }` |
| `handlers/compute.ts` — rule evaluation | JSONLogic | `args` | `{ ...args, probe }` |
| `tools.ts` — `applyTransform` | JSONLogic | `{ result, args }` | `{ result, args, probe }` |
| `server.ts` — tool description rendering at `tools/list` | Mustache | `{}` | `{ probe }` |

Probe context is keyed under `probe`, not merged at the top level — so `{{probe.teams}}` and `{ "var": "probe.teams" }` are the only paths that read it. This avoids name collisions with `args.teams` or any future top-level field.

The `map:` step in `resolveProbes` evaluates against `{ result }` only — there are no args at boot, and probes can't reference other probes.

### Concurrency

Probes are independent. They fetch in parallel via `Promise.allSettled`. Boot time is bounded by the slowest single probe (modulo each probe's `timeout_ms`).

Probes cannot reference each other. A probe whose handler config tries to read `{{probe.X}}` will get the empty `probe: {}` context at boot and resolve `{{probe.X}}` to the empty string — a quiet no-op that authors should treat as a configuration mistake. v1 does not cycle-detect or topologically resolve probes.

If a future use case needs probe-to-probe references, a follow-up plan can add a DAG resolver. The schema is forward-compatible: today's flat list becomes tomorrow's dependency graph without breaking changes.

### Value semantics

Probe values can be any JSON-shaped data (string, number, object, array, null). What happens when one is interpolated:

- **Mustache `{{probe.X}}`** uses the existing `render()` from Plan 1 (ADR-0007 "minimal string only"). Strings render as-is; numbers and booleans coerce via `String()`; objects and arrays JSON-stringify. Same behavior as `{{args.X}}` today.
- **JSONLogic `{ var: "probe.X" }`** returns the raw value — JSONLogic operates on rich types. Authors who need to project deeper (`probe.teams.0.name`) use dot-paths in the var.

### File layout

```
src/runtime/
  probes.ts              # NEW — validateProbes + resolveProbes
  config.ts              # +ProbeSpec, +ProbesConfig types, +probes wired into validate()
  handlers/index.ts      # +InvokeContext.probe
  handlers/{exec,http,graphql,dispatch,compute}.ts  # context wiring updates
  tools.ts               # applyTransform context update
  server.ts              # boot calls resolveProbes; descriptions get probe context

tests/
  probes.test.ts         # NEW — validator + resolver unit tests
  config.test.ts         # +probes validation tests
  handlers.test.ts       # existing tests get empty probe: {} in test contexts
  integration.test.ts    # +probe round-trip over stdio

examples/
  probes.yaml            # NEW — exec probe + tool that reads {{probe.git_sha}}

justfile                 # +smoke-probe recipe (hermetic exec-only example)
```

## Alternatives considered

### Lifecycle: boot-only vs async-refresh vs reload-driven

- **Async-refresh (per-probe TTL with background refresh)** would keep data fresh for long-running servers. Adds a scheduler, mutable cache with read/refresh races, and a worker loop. Deferred — probes' target use cases (Linear teams, AWS identity, git SHA) do not change minute-to-minute. Restart-to-refresh is acceptable for v1. A future plan can add `refresh_ms:` without breaking the boot-only contract.
- **Reload-driven** (re-fetch on SIGHUP / config-file mtime / explicit MCP method) would couple probe refresh to a config-reload subsystem that does not exist in jig today. Building reload to power probe refresh inverts the dependency.

### Failure policy: fail-fast vs warn-and-continue

Warn-and-continue would let the server boot with broken probes and degrade to a sentinel value (`null`, empty string, `<probe error>`). Rejected because the failure surfaces downstream as a malformed tool description that the agent acts on, not as a startup error the operator sees. Silent failures are explicit anti-goals across the jig design (cf. `commit.txt` consumed-and-removed semantics). Fail-fast keeps the failure where it can be diagnosed.

### Handler types: network only vs network + exec vs all

- **Network only** would match the design-doc example (graphql Linear teams) and nothing else. Rejected because `git rev-parse HEAD` and `aws sts get-caller-identity` are obvious additions and the existing exec handler already exists.
- **All handler types** (inline, compute, dispatch additionally) was rejected as over-built. `inline:` is trivial — an author who wants a literal `{{probe.X}}` writes the literal in the YAML where they need it. `compute:` is redundant with the optional `map:` step on top of any other handler. `dispatch:` has no `args` to discriminate on at boot.

### `map:` syntax: JSONLogic vs jq vs both

- **jq via a Node lib** would match the design doc's `.teams.nodes | map({...})` example and Clay's stated jq preference. Rejected because every Node jq lib has a runtime cost (`node-jq` shells out; `jq-wasm`/`jaq-wasm` add WASM weight) and Plan 4's "no new runtime deps" rule continues. JSONLogic is already in via `json-logic-engine` and is the expression engine for `transform:`, `when:`, and `compute:`. One engine, used everywhere.
- **Both `map:` (JSONLogic) and `jq:` (jq) as separate fields** doubles the implementation and test surface and adds the dep cost from B anyway. Splits the codebase's expression story.

### Surface scope: Mustache only vs Mustache + JSONLogic

Mustache-only would let `{{probe.X}}` work in description text and command lines but block JSONLogic (`transform:`, `when:`, `compute:`) from reading probe data. Rejected because `transform: { cat: ["[", { var: "probe.region" }, "] ", { var: result }] }` is an obvious use case that prefixes any tool's result with a probe-derived label without writing the prefix into every tool's description.

### Probe-to-probe references: independent vs DAG vs sequential

DAG (probes can `{{probe.X}}` each other) was rejected for v1 because the simplest observed use cases — Linear teams, git SHA, AWS identity, env captures — are independent. Sequential (in-declaration-order) would force boot time to the sum of probe durations rather than the max, with no observed benefit.

### Boot timeout: per-probe vs global cap vs both

A global boot timeout (default 60s on the whole probe phase) would force a single number to tune across all probes; one slow probe could starve fast ones if they all crowd the limit. Per-probe `timeout_ms` is granular enough for v1; defense-in-depth (per-probe + global) is over-built without a specific bite.

## Out of scope (deferred to later plans)

- Async refresh (`refresh_ms:` field, background refresh loop)
- Config reload (any mechanism)
- Probe-to-probe dependencies / DAG resolver
- Concurrency cap on parallel probe fetches
- Probe value persistence between server runs
- `inline:`, `compute:`, `dispatch:` as probe handler types
- `jq:` as an alternative to `map:`
