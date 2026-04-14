# jig Runtime — Plan 5 (probes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add `probes:` — a top-level optional block of startup-time data fetches whose resolved values are exposed as `{{probe.NAME}}` (Mustache) and `{ "var": "probe.NAME" }` (JSONLogic) across tool descriptions, handler config, transforms, and guards. Boot-only synchronous lifecycle, fail-fast on any probe failure, parallel independent fetch via `Promise.allSettled`, per-probe `timeout_ms` defaulting to 30 seconds.

**Architecture:** Six phases land in order. (1) `src/runtime/probes.ts` adds `validateProbes` (schema, exactly-one handler, unknown-key rejection) plus the `ProbeSpec`/`ProbesConfig` types in `src/runtime/config.ts`. (2) The same file gains `resolveProbes(probes, compiledConnections)` — a boot resolver that fan-outs `Promise.allSettled`, applies optional `map:` JSONLogic on each result, collects all failures, and `process.exit(1)`s with a single multi-line stderr block on any failure. (3) `InvokeContext` in `src/runtime/handlers/index.ts` gains a `probe: Record<string, unknown>` field; every handler that builds a Mustache or JSONLogic eval context merges `probe: ctx.probe` in. (4) `src/runtime/server.ts` boot calls `resolveProbes` after `configureAccess` and before tool registration; tool descriptions are pre-rendered with `{ probe: ctx.probe }` at registration time. (5) An example + `smoke-probe` recipe + integration test exercise the full chain. (6) The Plan 5 complete handoff names Plan 6 as next.

**Tech Stack:** No new production dependencies — reuses Plan 4's connection compilation, fetch wrapper, http/graphql/exec handlers, the `json-logic-engine@5.x` from Plan 3, and the Mustache `render()` from Plan 1. TypeScript 6.0+, `node:test`, `yaml` all unchanged.

---

## Scope Note

This is **plan 5 of ~7** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)) and the [Plan 5 design doc](../designs/2026-04-14-plan5-probes.md).

**Planned sequence:**

1. Plan 1 — smoke test (merged) — stdio MCP + inline tool
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. Plan 4 — connections + http + graphql (merged)
5. **Plan 5 — probes** (this plan)
6. Plan 6 — resources (+ watchers), prompts, completions, tasks (state machines)
7. Plan 7 — CLI (`jig new|dev|validate|build`) + build pipeline

**Out of scope for Plan 5 (carried to later plans):**

- **Async refresh** (`refresh_ms:` field, background refresh loop). Probes' target use cases (Linear teams, AWS identity, git SHA) don't change minute-to-minute; restart-to-refresh is acceptable for v1. The schema is forward-compatible with a later `refresh_ms:` addition.
- **Config reload** (any mechanism — SIGHUP, file mtime, MCP method). Probes don't need it; building reload to power probe refresh inverts the dependency.
- **Probe-to-probe dependencies / DAG resolution.** v1 probes can't reference each other; a probe whose handler config tries to read `{{probe.X}}` gets the empty `probe: {}` context at boot and resolves to empty string.
- **Concurrency cap** on parallel probe fetches. If 20 probes hit the same upstream, that's 20 concurrent requests. Add `max_parallel:` if a real user gets bitten.
- **Probe value persistence** between server runs. Cold start re-fetches every probe.
- **`inline:`, `compute:`, `dispatch:` as probe handler types.** Inline is trivial (write the literal in the YAML where you need it). Compute is redundant with `map:` on top of any other handler. Dispatch has no `args` to discriminate on at boot.
- **`jq:` syntax for `map:`.** JSONLogic only — one expression engine across `transform:`, `when:`, `compute:`, and now `map:`. No new runtime deps.

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **Quarantine holds.** SDK imports (`@modelcontextprotocol/*`) stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. Nothing in Plan 5 imports from the SDK.
- **Fail-fast at boot.** Any probe failure (handler returns `isError`, timeout, malformed `map:`) writes a multi-line block to stderr listing every failed probe, then `process.exit(1)`. The MCP server does NOT start in a degraded state. No silent fallbacks.
- **Probes can NOT reference probes.** `resolveProbes` always passes `probe: {}` to per-probe `invoke()` calls. v1 has no DAG resolver; future plans can add one without breaking the schema.
- **`map:` is JSONLogic.** No jq, no jsonata, no new dep. Reuses `evaluate()` from Plan 3.
- **No new runtime deps.** Node 22+ built-ins + the existing `json-logic-engine`.
- **Six gates must all pass before commit** (the existing five from Plan 4 plus a new `just smoke-probe` in Phase 5): `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`. Phase 5 adds `just smoke-probe` as the seventh gate.
- **Commits via `commit.txt`.** Every commit step writes the message to `commit.txt`; Clay runs `gtxt` (`git commit -F commit.txt && rm commit.txt`) and `git pm` (push + PR + auto-merge). Never `git commit` directly.
- **Specific-path `git add`** — never `-A`. Plugin hooks drop files in `.config/` mid-session; specific paths keep scope clean. Continued from the Plan 4 Phase 5 handoff convention.
- **Feature branch per phase.** `feat/plan5-doc`, `feat/plan5-types`, `feat/plan5-resolver`, `feat/plan5-context`, `feat/plan5-boot`, `feat/plan5-complete`. Each phase lands on main before the next starts.
- **Integration tests carry `{ timeout: 15_000 }`.** Subprocess-based tests hang forever on bugs without it.

## File Structure

```
jig/
  record/
    plans/
      2026-04-14-jig-runtime-plan5.md    # this plan (Phase 0)
    designs/
      2026-04-14-plan5-probes.md         # the spec (already merged as #34)
  src/
    runtime/
      probes.ts                          # NEW — validateProbes + resolveProbes (Phases 1, 2)
      config.ts                          # + ProbeSpec, ProbesConfig types, validator wiring (Phase 1)
      handlers/index.ts                  # + InvokeContext.probe (Phase 3)
      handlers/{exec,http,graphql,dispatch,compute}.ts  # context wiring (Phase 3)
      util/transform.ts                  # + probe in applyTransform context (Phase 3)
      server.ts                          # + boot calls resolveProbes; descriptions get probe context (Phase 4)
      index.ts                           # + boot orchestration extension (Phase 4)
  tests/
    probes.test.ts                       # NEW — validator + resolver unit tests (Phases 1, 2)
    config.test.ts                       # + probes parsing tests (Phase 1)
    handlers.test.ts                     # existing tests pass empty probe: {} (Phase 3)
    integration.test.ts                  # + probe round-trip over stdio (Phase 5)
  examples/
    probes.yaml                          # NEW (Phase 5)
  justfile                               # + smoke-probe recipe (Phase 5)
```

**Not in Plan 5:** anything under `src/runtime/handlers/probe.ts` (probes don't get a "handler" in the dispatch sense — they reuse existing handler types), `src/runtime/resources.ts`, `prompts.ts`, `tasks.ts`, `transports/http.ts`, `src/cli/`. Those arrive in later plans.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 5 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `feat/plan5-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 5 (probes)

Phase 0 of jig runtime Plan 5 — the plan doc itself. Subsequent
phases land on feat/plan5-types, feat/plan5-resolver,
feat/plan5-context, feat/plan5-boot, feat/plan5-complete.

Plan 5 delivers: probes: top-level block of startup-time data
fetches; per-probe timeout_ms (default 30s); fail-fast at boot on
any probe failure; parallel independent fetch via
Promise.allSettled; dual surface as {{probe.NAME}} (Mustache) and
{ var: probe.NAME } (JSONLogic) across tool descriptions, handler
config, transforms, and guards; optional JSONLogic map: shaping
step over each handler's raw response.

Out of scope per the scope note: async refresh (Plan 6+); reload;
DAG dependencies; inline/compute/dispatch as probe handlers; jq
syntax.
```

- [ ] **Step 2: Stage with specific path and commit**

Stage: `git add record/plans/2026-04-14-jig-runtime-plan5.md`

Clay: `gtxt && git pm`

Expected: Plan 5 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: `ProbeSpec` types + `validateProbes`

**Intent:** Land the schema. After this phase, `parseConfig()` on a YAML with a `probes:` block returns a typed `JigConfig.probes: ProbesConfig | undefined` with all the validation rules from the design doc enforced. No runtime behavior changes — the `probes` field is parsed and forgotten (no resolver yet).

**Branch:** `feat/plan5-types`

### Task 1.1: Add `ProbeSpec` + `ProbesConfig` types

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the types**

After `GraphqlHandler` (search for `export interface GraphqlHandler`):

```typescript
/**
 * A probe is a startup-time data fetch. The result is exposed as
 * {{probe.NAME}} (Mustache) and { var: "probe.NAME" } (JSONLogic)
 * across the rest of the YAML.
 *
 * Probes reuse the existing handler types but only graphql / http /
 * exec are accepted (inline / compute / dispatch are nonsensical at
 * boot — see Plan 5 design doc).
 */
export type ProbeHandler = GraphqlHandler | HttpHandler | { exec: string };

export interface ProbeSpec {
  handler: ProbeHandler;
  /** Optional JSONLogic rule applied to the parsed-or-raw handler response. */
  map?: JsonLogicRule;
  /** Per-probe timeout in milliseconds. Default: 30000. */
  timeout_ms?: number;
}

export type ProbesConfig = Record<string, ProbeSpec>;
```

- [ ] **Step 2: Extend `JigConfig` with the optional field**

Find `export interface JigConfig {` and add the field alongside `connections?:`:

```typescript
  /** Startup-time data fetches; resolved before tool registration. */
  probes?: ProbesConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — types compile without consumers.

### Task 1.2: Write the first failing test — accept a minimal probe

**Files:**
- Create: `tests/probes.test.ts` (this test file is new; subsequent probe-related unit tests land here)

- [ ] **Step 1: Write the test file scaffold**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a probes: block with a single graphql probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
probes:
  teams:
    graphql:
      connection: api
      query: "{ teams { name } }"
tools:
  - name: t1
    description: x
    handler:
      inline:
        text: ok
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes, "probes must be present");
  const p = cfg.probes["teams"];
  assert.ok(p, "teams probe must be present");
  assert.equal((p.handler as { graphql: { connection: string } }).graphql.connection, "api");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="config accepts a probes: block"`
Expected: FAIL — `parseConfig` does not yet wire the `probes:` block; `cfg.probes` is undefined.

### Task 1.3: Wire `validateProbes` into `parseConfig`

**Files:**
- Create: `src/runtime/probes.ts`
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Scaffold `src/runtime/probes.ts` with the validator skeleton**

```typescript
import type { ProbeSpec, ProbesConfig, GraphqlHandler, HttpHandler, JsonLogicRule } from "./config.ts";

const KNOWN_KEYS = new Set([
  "graphql", "http", "exec", "map", "timeout_ms",
]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate the top-level `probes:` block.
 *
 * Rules:
 *   - probes is undefined OR a mapping (rejects array, scalar, null)
 *   - each probe name matches /^[A-Za-z_][A-Za-z0-9_]*$/ (Mustache-safe)
 *   - each entry declares exactly one of graphql / http / exec
 *   - map: when present, accepted as arbitrary JSON (structural validation
 *     deferred to evaluation time, matching the `compute:` convention)
 *   - timeout_ms: optional positive number
 *   - unknown keys rejected
 */
export function validateProbes(v: unknown): ProbesConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: probes must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: ProbesConfig = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) {
      throw new Error(
        `config: probes.${name}: probe names must match ${NAME_RE} (alphanumeric + underscore, no leading digit)`,
      );
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: probes.${name} must be a mapping`);
    }
    out[name] = validateProbeEntry(entry as Record<string, unknown>, name);
  }
  return out;
}

function validateProbeEntry(e: Record<string, unknown>, name: string): ProbeSpec {
  // Reject unknown keys first so a typo'd "exec1" surfaces clearly.
  for (const key of Object.keys(e)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`config: probes.${name}: unknown key "${key}"`);
    }
  }

  const handlerKeys = ["graphql", "http", "exec"].filter((k) => e[k] !== undefined);
  if (handlerKeys.length === 0) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got none)`,
    );
  }
  if (handlerKeys.length > 1) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got ${handlerKeys.join(", ")})`,
    );
  }

  // Build the handler shape. We do NOT re-validate the inner handler here —
  // graphql/http get reused from validateGraphql/validateHttp at boot time
  // when they're actually invoked (resolveProbes, Phase 2). exec gets a
  // shape check here because it's a leaf.
  let handler: ProbeSpec["handler"];
  if (e["exec"] !== undefined) {
    if (typeof e["exec"] !== "string" || e["exec"].length === 0) {
      throw new Error(`config: probes.${name}.exec must be a non-empty string`);
    }
    handler = { exec: e["exec"] };
  } else if (e["graphql"] !== undefined) {
    if (!e["graphql"] || typeof e["graphql"] !== "object") {
      throw new Error(`config: probes.${name}.graphql must be a mapping`);
    }
    // Pass through; validateGraphql in config.ts validates shape at handler
    // dispatch. Probe-time validation would duplicate that logic.
    handler = { graphql: e["graphql"] } as GraphqlHandler;
  } else {
    if (!e["http"] || typeof e["http"] !== "object") {
      throw new Error(`config: probes.${name}.http must be a mapping`);
    }
    handler = { http: e["http"] } as HttpHandler;
  }

  const out: ProbeSpec = { handler };

  if (e["map"] !== undefined) {
    out.map = e["map"] as JsonLogicRule;
  }

  if (e["timeout_ms"] !== undefined) {
    if (
      typeof e["timeout_ms"] !== "number" ||
      !Number.isFinite(e["timeout_ms"]) ||
      e["timeout_ms"] <= 0
    ) {
      throw new Error(
        `config: probes.${name}.timeout_ms must be a positive number`,
      );
    }
    out.timeout_ms = e["timeout_ms"];
  }

  return out;
}
```

- [ ] **Step 2: Wire `validateProbes` into `parseConfig`**

In `src/runtime/config.ts`, find where `connections` is validated (search for `validateConnections`). Add the analogous call:

```typescript
import { validateProbes } from "./probes.ts";
```

(near the other `import` statements at top of file)

And in `parseConfig` (search for `const connections = validateConnections(...)`), add:

```typescript
  const probes = validateProbes(raw["probes"]);
```

Then in the returned `JigConfig` object literal, add the conditional spread:

```typescript
    ...(probes !== undefined && { probes }),
```

(matching the existing `...(connections !== undefined && { connections })` pattern)

- [ ] **Step 3: Run the Task 1.2 test**

Run: `npm test -- --test-name-pattern="config accepts a probes: block"`
Expected: PASS.

### Task 1.4: Schema validator tests — full coverage

**Files:**
- Modify: `tests/probes.test.ts`

- [ ] **Step 1: Append the validator tests**

```typescript
test("config accepts http and exec probes", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  status:
    http:
      connection: api
      method: GET
      path: /status
  git_sha:
    exec: "git rev-parse HEAD"
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes!["status"]?.handler);
  assert.equal((cfg.probes!["git_sha"]?.handler as { exec: string }).exec, "git rev-parse HEAD");
});

test("config rejects a probe with no handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  bare:
    timeout_ms: 1000
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /must declare exactly one of graphql, http, exec \(got none\)/);
});

test("config rejects a probe with two handlers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  conflicted:
    http: { connection: api, method: GET }
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /got http, exec/);
});

test("config rejects an unknown key in a probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  weird:
    exec: "echo hi"
    bogus: 42
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probes\.weird: unknown key "bogus"/);
});

test("config rejects probe names that aren't Mustache-safe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  "bad.name":
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probe names must match/);
});

test("config rejects negative timeout_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  slow:
    exec: "echo hi"
    timeout_ms: -1
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /timeout_ms must be a positive number/);
});

test("config accepts a probe with a map: rule (no structural check at parse time)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  shaped:
    exec: "echo hi"
    map:
      var: "result"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.probes!["shaped"]?.map, { var: "result" });
});

test("config accepts a server with no probes block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.probes, undefined);
});
```

- [ ] **Step 2: Run all probe tests**

Run: `npm test -- --test-name-pattern="config (accepts|rejects) (a probes|http and exec|a probe|an unknown|probe names|negative timeout|a probe with a map|a server with no probes)"`
Expected: PASS (8 tests).

### Task 1.5: Phase 1 final gate + commit

- [ ] **Step 1: Run all five gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`
Expected: PASS (six gates including Plan 4's smoke-http).

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): probes: schema + validator (no resolver yet)

Adds the probes: top-level block to JigConfig. Each probe declares
exactly one of graphql / http / exec, an optional JSONLogic map:
shaping rule (accepted as arbitrary JSON, validated at evaluation
time), and an optional positive timeout_ms. Probe names must match
/^[A-Za-z_][A-Za-z0-9_]*$/ so they're safe Mustache path segments.

src/runtime/probes.ts hosts validateProbes. config.ts wires it
alongside validateConnections. inline/compute/dispatch are rejected
as probe handlers per the design doc — they are nonsensical at
boot.

Resolver lands in Phase 2.
```

- [ ] **Step 3: Stage with specific paths**

Stage: `git add src/runtime/config.ts src/runtime/probes.ts tests/probes.test.ts`

Clay: `gtxt && git pm`

Expected: Phase 1 lands on main.

---

## Phase 2: `resolveProbes` boot resolver

**Intent:** Land the function that runs all probes at boot, applies the optional `map:` step, collects failures, and exits non-zero on any failure with a single multi-line stderr block. Phase 2 builds the resolver in isolation — it does NOT yet wire into the boot sequence (that's Phase 4) and does NOT yet thread `probe` into `InvokeContext` (that's Phase 3). The resolver takes `compiledConnections` as a parameter and constructs a minimal `InvokeContext` with `probe: {}` for the per-probe `invoke()` calls.

**Branch:** `feat/plan5-resolver`

### Task 2.1: Write the first failing test — single successful probe

**Files:**
- Modify: `tests/probes.test.ts`

- [ ] **Step 1: Append the resolver imports + first test**

```typescript
import { resolveProbes } from "../src/runtime/probes.ts";
import { compileConnections } from "../src/runtime/connections.ts";
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
import { createServer as createHttpServerProbes } from "node:http";
import type { AddressInfo as AddressInfoProbes } from "node:net";

async function startProbeFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createHttpServerProbes(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfoProbes).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("resolveProbes resolves a single graphql probe to its data field", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startProbeFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { teams: [{ name: "Eng" }] } }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await resolveProbes(
      {
        teams: {
          handler: { graphql: { connection: "api", query: "{ teams { name } }" } },
        },
      },
      compiled,
    );
    // Default graphql data mode returns the JSON-stringified data field.
    const parsed = JSON.parse(result["teams"] as string) as { teams: { name: string }[] };
    assert.equal(parsed.teams[0]!.name, "Eng");
  } finally {
    await fix.close();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="resolveProbes resolves a single graphql"`
Expected: FAIL — `resolveProbes` is not exported from `src/runtime/probes.ts`.

### Task 2.2: Implement `resolveProbes` (success path)

**Files:**
- Modify: `src/runtime/probes.ts`

- [ ] **Step 1: Add the resolver implementation**

Append to `src/runtime/probes.ts`:

```typescript
import type { Handler } from "./config.ts";
import type { CompiledConnection } from "./connections.ts";
import { invoke, type InvokeContext } from "./handlers/index.ts";
import { evaluate } from "./util/jsonlogic.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolve every probe in the config at boot.
 *
 * Each probe runs concurrently via Promise.allSettled. On any failure
 * (handler isError, timeout, malformed map: evaluation), this function
 * writes a multi-line block to stderr listing every failed probe and
 * calls process.exit(1). The MCP server does not start in a degraded
 * state.
 *
 * Per-probe context at boot is empty: `args = {}`, `probe = {}`. Probes
 * cannot reference other probes in v1.
 */
export async function resolveProbes(
  probes: ProbesConfig | undefined,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<Record<string, unknown>> {
  if (probes === undefined || Object.keys(probes).length === 0) {
    return {};
  }

  const ctx: InvokeContext = {
    connections: compiledConnections,
    probe: {},
  };

  const entries = Object.entries(probes);
  const settled = await Promise.allSettled(
    entries.map(([name, spec]) => resolveOne(name, spec, ctx)),
  );

  const failures: { name: string; reason: string }[] = [];
  const values: Record<string, unknown> = {};

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    const name = entries[i]![0];
    if (r.status === "fulfilled") {
      values[name] = r.value;
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failures.push({ name, reason });
    }
  }

  if (failures.length > 0) {
    const header = `jig: probe resolution failed for ${failures.length} probe${failures.length === 1 ? "" : "s"} (server will not start):`;
    const body = failures
      .map((f) => `\n  probe "${f.name}":\n    ${f.reason}`)
      .join("");
    process.stderr.write(`${header}\n${body}\n\n`);
    process.exit(1);
  }

  return values;
}

async function resolveOne(
  name: string,
  spec: ProbeSpec,
  ctx: InvokeContext,
): Promise<unknown> {
  const timeoutMs = spec.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const handler = spec.handler as Handler;
  const dispatchPromise = invoke(handler, {}, ctx);

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`probe "${name}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  let raw: import("./handlers/types.ts").ToolCallResult;
  try {
    raw = await Promise.race([dispatchPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }

  if (raw.isError) {
    throw new Error(raw.content[0]?.text ?? "handler returned isError with no text");
  }

  const text = raw.content[0]?.text ?? "";
  // Try to parse the handler text as JSON; fall back to the raw string
  // if it's not JSON. The map: rule sees `{ result: <parsed-or-raw> }`.
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    result = text;
  }

  if (spec.map === undefined) return result;

  try {
    return await evaluate(spec.map, { result });
  } catch (err) {
    throw new Error(
      `map: rule failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
```

- [ ] **Step 2: Run the Task 2.1 test**

Run: `npm test -- --test-name-pattern="resolveProbes resolves a single graphql"`
Expected: PASS.

### Task 2.3: Tests — exec probe + `map:` shaping + raw-text fallback

**Files:**
- Modify: `tests/probes.test.ts`

- [ ] **Step 1: Append the tests**

```typescript
test("resolveProbes resolves an exec probe to its stdout", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  const result = await resolveProbes(
    { greeting: { handler: { exec: "echo hello" } } },
    {},
  );
  assert.match(String(result["greeting"]), /hello/);
});

test("resolveProbes applies map: to shape the response", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startProbeFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { teams: [{ name: "Eng" }, { name: "Ops" }] } }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await resolveProbes(
      {
        team_names: {
          handler: { graphql: { connection: "api", query: "{ teams { name } }" } },
          // Map walks through the JSON-stringified graphql data-mode result;
          // the resolver pre-parses, so map sees the parsed object.
          map: { map: [{ var: "result.teams" }, { var: "name" }] },
        },
      },
      compiled,
    );
    assert.deepEqual(result["team_names"], ["Eng", "Ops"]);
  } finally {
    await fix.close();
  }
});

test("resolveProbes falls back to raw text when handler response is not JSON", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  // exec returns plain text — the resolver's JSON.parse fails and the
  // result lands as a string.
  const result = await resolveProbes(
    { plain: { handler: { exec: "echo plain text here" } } },
    {},
  );
  assert.match(String(result["plain"]), /plain text here/);
});

test("resolveProbes returns empty object when probes is undefined or empty", async () => {
  assert.deepEqual(await resolveProbes(undefined, {}), {});
  assert.deepEqual(await resolveProbes({}, {}), {});
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- --test-name-pattern="resolveProbes (resolves an exec|applies map|falls back|returns empty)"`
Expected: PASS (4 tests).

### Task 2.4: Tests — failure paths (timeout, isError, multi-failure, exit)

**Failure tests need `process.exit` interception.** The resolver calls `process.exit(1)` directly. Tests use a child-process spawn pattern: drive `resolveProbes` from a tiny script, observe the exit code and stderr.

**Files:**
- Modify: `tests/probes.test.ts`

- [ ] **Step 1: Add a helper that runs `resolveProbes` in a subprocess and captures exit + stderr**

Append to `tests/probes.test.ts`:

```typescript
import { spawn } from "node:child_process";

interface SubprocResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

function runResolveSubprocess(driverScript: string, timeoutMs = 10_000): Promise<SubprocResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "--input-type=module", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("subprocess timeout"));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
    child.stdin.write(driverScript);
    child.stdin.end();
  });
}
```

- [ ] **Step 2: Add the timeout test**

```typescript
test(
  "resolveProbes exits 1 on a per-probe timeout",
  { timeout: 15_000 },
  async () => {
    // The exec probe sleeps 5s but the timeout is 50ms — should fail fast.
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  { slow: { handler: { exec: "sleep 5" }, timeout_ms: 50 } },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 1 probe/);
    assert.match(r.stderr, /probe "slow":/);
    assert.match(r.stderr, /timed out after 50ms/);
    assert.doesNotMatch(r.stdout, /UNREACHABLE/);
  },
);
```

- [ ] **Step 3: Add the isError test**

```typescript
test(
  "resolveProbes exits 1 on a handler isError result",
  { timeout: 15_000 },
  async () => {
    // The exec probe runs a missing binary — the exec handler returns
    // isError with a clear message.
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  { broken: { handler: { exec: "this-command-does-not-exist-xyz" } } },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 1 probe/);
    assert.match(r.stderr, /probe "broken":/);
    assert.doesNotMatch(r.stdout, /UNREACHABLE/);
  },
);
```

- [ ] **Step 4: Add the multi-failure test**

```typescript
test(
  "resolveProbes lists every failure when multiple probes fail",
  { timeout: 15_000 },
  async () => {
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  {
    a: { handler: { exec: "this-command-does-not-exist-aaa" } },
    b: { handler: { exec: "this-command-does-not-exist-bbb" } },
  },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 2 probes/);
    assert.match(r.stderr, /probe "a":/);
    assert.match(r.stderr, /probe "b":/);
  },
);
```

- [ ] **Step 5: Add the bad-`map:` test**

```typescript
test(
  "resolveProbes exits 1 when map: throws",
  { timeout: 15_000 },
  async () => {
    // `map: { var: "result.does.not.exist.here" }` resolves to undefined,
    // which is fine — JSONLogic doesn't throw on missing paths. Use an
    // operator that DOES throw on bad input — divide by string.
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  {
    bad_map: {
      handler: { exec: "echo hi" },
      map: { "/": [{ var: "result" }, 0] },
    },
  },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe "bad_map":/);
    assert.match(r.stderr, /map: rule failed/);
  },
);
```

- [ ] **Step 6: Run the failure-path tests**

Run: `npm test -- --test-name-pattern="resolveProbes (exits 1|lists every failure)"`
Expected: PASS (4 tests).

### Task 2.5: Phase 2 final gate + commit

- [ ] **Step 1: Run all six gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`
Expected: PASS.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): resolveProbes — boot resolver with fail-fast policy

Adds resolveProbes(probes, compiledConnections) to src/runtime/probes.ts.
Each probe runs concurrently via Promise.allSettled with a per-probe
Promise.race against setTimeout for the timeout (default 30s).

On any failure — handler isError, timeout, or map: evaluation throw —
the resolver writes a single multi-line block to stderr listing every
failed probe and calls process.exit(1). The MCP server does not start
in a degraded state.

Per-probe context at boot is empty: args = {}, probe = {}. Probes
cannot reference other probes in v1.

The resolver is not yet wired into the boot sequence (Phase 4) and
InvokeContext.probe is not yet threaded through handlers (Phase 3).
This phase lands the resolver in isolation, exercised by direct unit
tests + subprocess-spawn tests for the process.exit paths.
```

- [ ] **Step 3: Stage with specific paths**

Stage: `git add src/runtime/probes.ts tests/probes.test.ts`

Clay: `gtxt && git pm`

Expected: Phase 2 lands on main.

---

## Phase 3: `InvokeContext.probe` + handler render-context wiring

**Intent:** Extend `InvokeContext` with `probe: Record<string, unknown>` and update every handler that builds a Mustache or JSONLogic eval context to merge `probe: ctx.probe` in. After this phase, tools can reference `{{probe.X}}` and `{ var: "probe.X" }` in their handler config — but the value is always `{}` because the boot resolver isn't wired yet (Phase 4).

This phase is a mechanical sweep across 6 files. The failure mode is forgetting one — TypeScript catches the `InvokeContext` shape change at the call sites that pass `ctx` through, but doesn't catch render/eval call sites that build `args` ad-hoc.

**Branch:** `feat/plan5-context`

### Task 3.1: Extend `InvokeContext` with `probe`

**Files:**
- Modify: `src/runtime/handlers/index.ts`

- [ ] **Step 1: Add the field**

In `src/runtime/handlers/index.ts`, change:

```typescript
export interface InvokeContext {
  connections: Record<string, CompiledConnection>;
}
```

to:

```typescript
export interface InvokeContext {
  connections: Record<string, CompiledConnection>;
  /** Resolved probe values, keyed by probe name. Empty {} when no probes. */
  probe: Record<string, unknown>;
}
```

- [ ] **Step 2: Run typecheck — observe the breakage**

Run: `npm run check`
Expected: FAIL — every existing call site that constructs an `InvokeContext` (production + tests) now misses the required `probe` field.

The errors point to exactly the call sites Task 3.2 fixes.

### Task 3.2: Fix every InvokeContext construction site

**Files** (production):
- Modify: `src/runtime/index.ts` (the runtime boot wiring)
- Modify: `src/runtime/probes.ts` (the resolver already constructs `InvokeContext` correctly with `probe: {}` from Phase 2 — verify)

**Files** (tests — all places that mock `InvokeContext`):
- Modify: `tests/handlers.test.ts`
- Modify: `tests/integration.test.ts` (only if the integration tests construct `InvokeContext` directly)

- [ ] **Step 1: Update production boot**

In `src/runtime/index.ts`, find where the `InvokeContext` is constructed (search for `connections:` near `invoke(`). Wherever it appears as `{ connections }` or `{ connections: ... }`, add `probe: {}`:

```typescript
const ctx: InvokeContext = {
  connections: compiledConnections,
  probe: {},   // populated by resolveProbes in Phase 4
};
```

- [ ] **Step 2: Update test mocks**

In `tests/handlers.test.ts`, search for every `InvokeContext` construction (or every `invoke(` call that takes a third arg). Wherever the `ctx` object is built, add `probe: {}`:

```typescript
const ctx: InvokeContext = { connections: compiled, probe: {} };
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — every call site now constructs the full shape.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (no test count change; no existing test exercised `probe` yet).

### Task 3.3: Wire `probe` into Mustache render contexts

**Files:**
- Modify: `src/runtime/handlers/exec.ts`
- Modify: `src/runtime/handlers/http.ts`
- Modify: `src/runtime/handlers/graphql.ts`

The change pattern is identical: every `render(template, args)` becomes `render(template, { ...args, probe: ctx.probe })`. The handlers receive `ctx` as their third arg already (Plan 4); they just need to thread `probe` into the render context.

- [ ] **Step 1: Update `src/runtime/handlers/exec.ts`**

Find:

```typescript
const rendered = render(handler.exec, args);
```

Change to:

```typescript
const rendered = render(handler.exec, { ...args, probe: ctx.probe });
```

The function signature already accepts `ctx`; if it doesn't (look for `invokeExec(handler, args)`), update the signature to `invokeExec(handler, args, ctx)` and update the dispatch arm in `src/runtime/handlers/index.ts` accordingly. Mirror the http/graphql arm pattern.

If `invokeExec` does not currently take `ctx`, this is the structural change: `exec` joins http/graphql in receiving the full `InvokeContext` so it can read `ctx.probe`.

- [ ] **Step 2: Update `src/runtime/handlers/http.ts`**

There are multiple `render()` call sites. Replace every `args` with `{ ...args, probe: ctx.probe }` in:
- `render(spec.url, ...)` (when no connection)
- `render(spec.path, ...)`
- `render(v, ...)` inside the query loop
- `render(v, ...)` inside the headers loop
- `render(spec.body, ...)` (string body branch)
- `render(value, ...)` inside `renderJsonLeaves`

For `renderJsonLeaves`, also update its signature so it accepts the merged context (probe already merged in):

```typescript
function renderJsonLeaves(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === "string") return render(value, ctx);
  if (Array.isArray(value)) return value.map((v) => renderJsonLeaves(v, ctx));
  ...
}
```

And the call site:

```typescript
const jsonReady = renderJsonLeaves(spec.body, { ...args, probe: ctx.probe });
```

- [ ] **Step 3: Update `src/runtime/handlers/graphql.ts`**

Mirror Step 2:

```typescript
const renderCtx = { ...args, probe: ctx.probe };
const query = render(spec.query, renderCtx);
const variables = spec.variables === undefined
  ? undefined
  : renderJsonLeaves(spec.variables, renderCtx);
```

The `renderJsonLeaves` in `graphql.ts` (currently identical to http.ts's) gets the same signature update.

**Note on duplication:** Both `http.ts` and `graphql.ts` have a `renderJsonLeaves` helper. Plan 4's code-quality reviewer flagged this as "rule of two" and recommended deferring extraction until a third caller appears. Plan 5 does not introduce a third caller; the recommendation continues to defer.

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

### Task 3.4: Wire `probe` into JSONLogic eval contexts

**Files:**
- Modify: `src/runtime/handlers/dispatch.ts`
- Modify: `src/runtime/handlers/compute.ts`
- Modify: `src/runtime/util/transform.ts`

- [ ] **Step 1: Update `src/runtime/handlers/dispatch.ts`**

Find:

```typescript
const raw = await evaluate(matched.when, args);
```

Change to:

```typescript
const raw = await evaluate(matched.when, { ...args, probe: ctx.probe });
```

`invokeDispatch` already accepts the dispatch-flavored `InvokeFn` (Plan 4) so it sees `ctx` indirectly. If it does not have direct access to `ctx.probe`, update `InvokeFn` to also pass `probe` — see Plan 4 Phase 5 for the closure pattern that keeps `dispatch.ts` acyclic. Concretely: extend the closure in `src/runtime/handlers/index.ts` to pass `probe` alongside the recursive `invoke`:

```typescript
return invokeDispatch(handler, args, (h, a) => invoke(h, a, ctx), ctx.probe);
```

And `invokeDispatch`'s signature gains a fourth `probe: Record<string, unknown>` param.

- [ ] **Step 2: Update `src/runtime/handlers/compute.ts`**

Find:

```typescript
const value = await evaluate(handler.compute, args);
```

Change to:

```typescript
const value = await evaluate(handler.compute, { ...args, probe: ctx.probe });
```

If `invokeCompute` does not take `ctx` today, add it (mirror http's signature) and update the dispatch arm in `src/runtime/handlers/index.ts`.

- [ ] **Step 3: Update `src/runtime/util/transform.ts`**

Find `applyTransform`. Its signature is currently something like:

```typescript
export async function applyTransform(
  raw: ToolCallResult,
  args: Record<string, unknown>,
  transform: JsonLogicRule,
): Promise<ToolCallResult>
```

Add a `probe` parameter:

```typescript
export async function applyTransform(
  raw: ToolCallResult,
  args: Record<string, unknown>,
  probe: Record<string, unknown>,
  transform: JsonLogicRule,
): Promise<ToolCallResult>
```

And inside the body, every `evaluate(transform, { result, args })` becomes `evaluate(transform, { result, args, probe })`.

Update the call site in `src/runtime/index.ts`:

```typescript
return applyTransform(raw, normalized, ctx.probe, tool.transform);
```

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run check && npm test`
Expected: PASS — typecheck verifies every signature change; tests pass because no existing test asserted `probe.X` semantics yet.

### Task 3.5: Add a regression test that proves probe context flows everywhere

**Files:**
- Modify: `tests/handlers.test.ts`

This test exercises every render/eval site by constructing an `InvokeContext` with a non-empty `probe` map and calling each handler. The point is to catch the "I forgot one site" bug.

- [ ] **Step 1: Write the test**

```typescript
test("probe context flows into exec handler render", async () => {
  const ctx = { connections: {}, probe: { greeting: "world" } };
  const result = await invokeExec(
    { exec: "echo {{probe.greeting}}" },
    {},
    ctx,
  );
  assert.equal(result.isError, undefined);
  assert.match(result.content[0]!.text, /world/);
});

test("probe context flows into compute handler", async () => {
  const ctx = { connections: {}, probe: { region: "us-east-1" } };
  const result = await invokeCompute(
    { compute: { var: "probe.region" } },
    {},
    ctx,
  );
  assert.equal(result.content[0]!.text, '"us-east-1"');
});

test("probe context flows into transform", async () => {
  const raw = { content: [{ type: "text", text: "tool result" }] } as ToolCallResult;
  const out = await applyTransform(
    raw,
    {},
    { region: "us-east-1" },
    { cat: ["[", { var: "probe.region" }, "] ", { var: "result" }] },
  );
  assert.equal(out.content[0]!.text, "[us-east-1] tool result");
});
```

The dispatch and http/graphql cases are exercised by the integration test in Phase 5 (multi-handler round-trip), so we don't need three more tiny tests here — keep this regression test focused on the call sites that don't have integration coverage.

- [ ] **Step 2: Run the new tests**

Run: `npm test -- --test-name-pattern="probe context flows"`
Expected: PASS (3 tests).

### Task 3.6: Phase 3 final gate + commit

- [ ] **Step 1: Run all six gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`
Expected: PASS.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): InvokeContext.probe + handler render-context wiring

InvokeContext gains probe: Record<string, unknown>. Every handler
that builds a Mustache or JSONLogic eval context merges
probe: ctx.probe in:

  - exec.ts:    render(handler.exec, { ...args, probe })
  - http.ts:    render() across url/path/query/headers/body + renderJsonLeaves
  - graphql.ts: render() across query + renderJsonLeaves on variables
  - dispatch.ts: evaluate(when, { ...args, probe }) — closure passes probe
  - compute.ts: evaluate(rule, { ...args, probe })
  - util/transform.ts: applyTransform takes probe and threads it into eval

Production boot in src/runtime/index.ts seeds probe: {} (Phase 4
plumbs the resolver output here). All test-side InvokeContext mocks
add probe: {} so the new field's required-ness compiles.

A regression test in tests/handlers.test.ts asserts that probe data
reaches exec / compute / transform render sites. dispatch and
http/graphql get integration-test coverage in Phase 5.
```

- [ ] **Step 3: Stage with specific paths**

Stage: `git add src/runtime/handlers/index.ts src/runtime/handlers/exec.ts src/runtime/handlers/http.ts src/runtime/handlers/graphql.ts src/runtime/handlers/dispatch.ts src/runtime/handlers/compute.ts src/runtime/util/transform.ts src/runtime/index.ts tests/handlers.test.ts`

(adjust the file list if Task 3.2's typecheck pointed to additional test files)

Clay: `gtxt && git pm`

Expected: Phase 3 lands on main.

---

## Phase 4: Boot sequence wiring + description rendering

**Intent:** Connect the Phase 2 resolver to the Phase 3 context. After this phase, declaring `probes:` in YAML actually fetches them at boot, populates `InvokeContext.probe` with the resolved values, and pre-renders tool descriptions through Mustache so `{{probe.X}}` works in description text.

**Branch:** `feat/plan5-boot`

### Task 4.1: Wire `resolveProbes` into the boot sequence

**Files:**
- Modify: `src/runtime/index.ts` (the boot wiring)

- [ ] **Step 1: Add the resolver call**

In `src/runtime/index.ts`, find where `compileConnections` is called. The boot order today is:

```typescript
const compiledConnections = compileConnections(config.connections);
configureAccess(...);
// (tool registration here)
```

Insert `resolveProbes` between `configureAccess` and tool registration:

```typescript
import { resolveProbes } from "./probes.ts";

const compiledConnections = compileConnections(config.connections);
configureAccess({ ...config.server.security }, process.cwd());
const probe = await resolveProbes(config.probes, compiledConnections);

const ctx: InvokeContext = {
  connections: compiledConnections,
  probe,
};
```

(replacing the temporary `probe: {}` placeholder from Phase 3 Task 3.2 Step 1.)

The `resolveProbes` call may invoke `process.exit(1)` if a probe fails — there's no return-value error path. The boot function does not need a try/catch.

- [ ] **Step 2: Run all six gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`
Expected: PASS — no existing test exercises a `probes:` block, so all four smoke recipes that don't declare probes still boot identically.

### Task 4.2: Pre-render tool descriptions with `{ probe }`

**Files:**
- Modify: `src/runtime/server.ts`

Today, tool descriptions are passed to `server.registerTool` as raw strings — Mustache never touches them. Plan 5 adds a single render pass at registration time, against `{ probe: ctx.probe }`. Args aren't available at description time (no tool call yet), so `{{args.X}}` in a description renders to empty string — same behavior as today, just now `{{probe.X}}` works.

This is a one-time bake-in at boot; if a future plan adds refresh, descriptions might want to re-render then. Plan 5 deliberately picks the simpler shape.

- [ ] **Step 1: Modify `registerTool`**

In `src/runtime/server.ts`, find the `registerTool` implementation. Change every `description: spec.description` to `description: render(spec.description, { probe })` — `probe` needs to be in scope. The cleanest way: the `JigServerHandle` wrapper (`createServer`) needs to receive `probe` from the boot caller and capture it in the closure.

Concretely, change the `createServer` signature:

```typescript
export function createServer(
  config: JigConfig,
  probe: Record<string, unknown>,
): JigServerHandle {
```

Inside, change every description literal:

```typescript
description: render(spec.description, { probe }),
```

(Make sure `render` is imported from `./util/template.ts` if it isn't already.)

The `server.description` literal at line ~110 is a SERVER description, not a tool description — leave it alone unless you also want to render that, in which case the same single-line change applies.

- [ ] **Step 2: Update the `createServer` caller in `src/runtime/index.ts`**

Find `createServer(config)` (or wherever the entry-point boots the server) and change to `createServer(config, probe)` — passing the probe map from `resolveProbes`.

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run check && npm test`
Expected: PASS — no existing tool description in the test fixtures uses `{{probe.X}}`, so behavior is unchanged for them.

### Task 4.3: End-to-end test — boot a server with a probe and verify the description bakes the value

**Files:**
- Modify: `tests/integration.test.ts`

The test spins up a real server in a subprocess via the existing `sendRpc` helper, hands it a YAML with one exec probe and one tool whose description references `{{probe.X}}`, and asserts that `tools/list` returns the rendered description.

- [ ] **Step 1: Append the test**

```typescript
test(
  "probe value bakes into tool description at registration time",
  { timeout: 15_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-plan5-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan5-int
  version: "0.0.1"
probes:
  marker:
    exec: "echo plan5-marker-value"
tools:
  - name: t1
    description: "Marker is {{probe.marker}}"
    handler: { inline: { text: ok } }
`,
    );
    try {
      const responses = await sendRpc(
        join(process.cwd(), "src/runtime/index.ts"),
        configPath,
        [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "t", version: "0" },
            },
          },
          { jsonrpc: "2.0", id: 2, method: "tools/list" },
        ],
      );
      const list = responses.find((r) => r.id === 2)!.result as {
        tools: { name: string; description: string }[];
      };
      const t1 = list.tools.find((t) => t.name === "t1")!;
      // exec strips trailing newline; the marker should be a clean substring.
      assert.match(t1.description, /Marker is plan5-marker-value/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);
```

- [ ] **Step 2: Run the test**

Run: `npm test -- --test-name-pattern="probe value bakes into tool description"`
Expected: PASS.

### Task 4.4: Phase 4 final gate + commit

- [ ] **Step 1: Run all six gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`
Expected: PASS.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): wire probes into boot + description rendering

src/runtime/index.ts now calls resolveProbes after configureAccess
and before tool registration. The resolved probe map populates
InvokeContext.probe instead of the Phase 3 placeholder {}.

src/runtime/server.ts pre-renders every tool description through
Mustache with { probe } at registration time. Args aren't
available at description time (no tool call yet), so {{args.X}}
renders to empty string — same as today; {{probe.X}} now works.

A new integration test boots a server with one exec probe and
one tool whose description embeds {{probe.X}}, then asserts the
tools/list response carries the baked-in value. Confirms the full
chain: parseConfig → resolveProbes → InvokeContext → registerTool
→ render(description, { probe }).
```

- [ ] **Step 3: Stage with specific paths**

Stage: `git add src/runtime/index.ts src/runtime/server.ts tests/integration.test.ts`

Clay: `gtxt && git pm`

Expected: Phase 4 lands on main.

---

## Phase 5: Example + smoke-probe + integration test + Plan 5 complete handoff

**Intent:** Author-facing assets that show probes in action. An `examples/probes.yaml` that exercises an exec probe + a graphql probe + the four touch points (description, command line, transform, JSONLogic guard). A `just smoke-probe` recipe that boots the example with no network (exec-only path, hermetic). An integration test that round-trips a tool whose handler reads `{{probe.X}}` against a fixture-served graphql probe. The Plan 5 complete handoff naming Plan 6 as next.

**Branch:** `feat/plan5-complete`

### Task 5.1: Write `examples/probes.yaml`

**Files:**
- Create: `examples/probes.yaml`

- [ ] **Step 1: Write the example**

```yaml
# A Plan 5 example that exercises probes. Demonstrates:
#   - exec probe: capture the current git SHA at boot
#   - exec probe: capture the current shell user
#   - probe value baked into a tool description
#   - probe value referenced in a transform via JSONLogic
#   - probe value referenced in a handler command line via Mustache
#
# Run with `just smoke-probe` (hermetic — no network probes).

server:
  name: jig-plan5-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 5: probes block, fail-fast at boot,
    {{probe.NAME}} surface across description / handler / transform.

  security:
    env:
      allow:
        - "USER"
        - "HOME"

probes:
  git_sha:
    exec: "git rev-parse --short HEAD"
  current_user:
    exec: "whoami"

tools:
  - name: example
    description: |
      Built from commit {{probe.git_sha}} by {{probe.current_user}}.
      Actions:
        echo  → echo a message back, prefixed with the user
        help  → static action help

    input:
      action:
        type: string
        required: true
      message:
        type: string

    handler:
      dispatch:
        on: action
        cases:
          echo:
            requires: [message]
            handler:
              exec: "echo [{{probe.current_user}}] {{message}}"

          help:
            handler:
              inline:
                text: |
                  example: { echo | help }
                    echo  requires message
                    help  always valid

    transform:
      cat:
        - "(@"
        - { var: "probe.git_sha" }
        - ") "
        - { var: "result" }
```

### Task 5.2: Add `just smoke-probe`

**Files:**
- Modify: `justfile`

The recipe runs the `help` action — no `message` needed, no exec subprocess at request time. The two probes (`git_sha`, `current_user`) DO run at boot because they're the smoke-test target. Both are exec probes, so no network is required — the recipe stays hermetic.

- [ ] **Step 1: Append the recipe**

```just
# Smoke-probe: verify the Plan 5 example boots, both probes resolve,
# the tool description bakes in {{probe.git_sha}} and
# {{probe.current_user}}, and the transform wraps the help action's
# inline text. Hermetic — exec probes only, no network round-trip.
smoke-probe:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/list"}
    {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"example","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/probes.yaml)
    if [ -z "$output" ]; then
      echo "smoke-probe: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -2 | jq .
```

- [ ] **Step 2: Run the recipe**

Run: `just smoke-probe`
Expected: two JSON-RPC responses. The `tools/list` response carries `description` text including `Built from commit <sha>` and `by <user>`. The `tools/call` response carries `content[0].text` including `(@<sha>) example: { echo | help }...`.

### Task 5.3: Integration test — graphql probe round-trip

**Files:**
- Modify: `tests/integration.test.ts`

The Phase 4 integration test covered the description-baking path with an exec probe. This test covers the graphql path with a fixture-served probe AND verifies probe data reaches a tool's handler command line via Mustache.

- [ ] **Step 1: Append the test**

```typescript
test(
  "graphql probe value flows into tool handler at request time",
  { timeout: 15_000 },
  async () => {
    const seen: string[] = [];
    const server = createHttpServerInt((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push(req.url ?? "");
        if (req.url === "/graphql") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: { region: "us-east-1" } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfoInt).port;
    const fixtureUrl = `http://127.0.0.1:${port}`;

    const dir = mkdtempSync(join(tmpdir(), "jig-plan5-gql-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan5-gql-int
  version: "0.0.1"
connections:
  api:
    url: ${fixtureUrl}/graphql
    timeout_ms: 2000
probes:
  region_envelope:
    graphql:
      connection: api
      query: "{ region }"
    map: { var: "result.region" }
tools:
  - name: where
    description: x
    handler:
      exec: "echo region={{probe.region_envelope}}"
`,
    );
    try {
      const responses = await sendRpc(
        join(process.cwd(), "src/runtime/index.ts"),
        configPath,
        [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "t", version: "0" },
            },
          },
          { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "where", arguments: {} } },
        ],
      );
      // Probe ran at boot, fixture saw the graphql request.
      assert.ok(seen.includes("/graphql"), "fixture should have seen /graphql");
      const out = responses.find((r) => r.id === 2)!.result as {
        content: { text: string }[];
      };
      assert.match(out.content[0]!.text, /region=us-east-1/);
    } finally {
      rmSync(dir, { recursive: true });
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);
```

- [ ] **Step 2: Run the test**

Run: `npm test -- --test-name-pattern="graphql probe value flows"`
Expected: PASS.

### Task 5.4: Plan 5 complete handoff

**Files:**
- Create: `.handoffs/<YYYY-MM-DD-HHMM>-jig-runtime-plan5-complete.md` (use `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Invoke the `building-in-the-open:curating-context` skill**

Public mode, Context Curator persona. Four required sections (Where things stand / Decisions made / What's next / Landmines), under 2,000 tokens per bito.

Cover:
- **State:** Green. Plan 5 passing all tests plus seven smoke recipes (`smoke`, `smoke-dispatch`, `smoke-compute`, `smoke-http`, `smoke-probe`).
- **What changed:** Five implementation phases (Phase 0 landed the plan doc). Schema + validator (Phase 1), boot resolver with fail-fast + per-probe timeout (Phase 2), `InvokeContext.probe` plumbing across handlers + transform (Phase 3), boot sequence wiring + description rendering (Phase 4), example + smoke-probe + integration tests + this handoff (Phase 5).
- **What's next:** Plan 6 — resources (+ watchers), prompts, completions, tasks (state machines). The probe surface is stable; resources extend the boot-resolved-data pattern with watchers (file system events triggering re-resolution).
- **Landmines:**
  - `process.exit(1)` in `resolveProbes` runs synchronously after a probe failure — any open file descriptors, sockets, or `setTimeout` handles in the parent get killed. Acceptable at boot; would need rework if a future plan calls the resolver from a long-running context.
  - Description rendering bakes `{{probe.X}}` at registration time. A future async-refresh plan must re-register the tool (and re-emit `notifications/tools/list_changed`) for description updates to propagate.
  - Probes can't reference probes — the `probe: {}` context passed to `invoke()` from `resolveProbes` is intentional. A future DAG resolver lands as its own plan; today's silent "render to empty string" behavior is the v1 sentinel.
  - Subprocess-based failure tests in `tests/probes.test.ts` use `process.execPath` + `--input-type=module` heredocs. Slow on CI; consider mocking `process.exit` if test time becomes painful.

For the timestamp: `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`.

For reference, prior handoffs in this repo are in `.handoffs/` — read `.handoffs/2026-04-14-1852-jig-runtime-plan4-complete.md` for the established format and tone before writing yours.

### Task 5.5: Phase 5 final gate + commit

- [ ] **Step 1: Run all seven gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`
Expected: PASS (seven gates including the new `smoke-probe`).

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): plan 5 example, smoke-probe, integration, handoff

Adds examples/probes.yaml — a tool whose description, handler
command line, and transform all reference {{probe.X}} from two
exec probes (git_sha, current_user). Demonstrates the Plan 5
surface end-to-end without network.

Adds `just smoke-probe` — initialize + tools/list (verifies
description baking) + tools/call help (verifies transform).
Hermetic; runs against the example YAML which uses exec-only
probes.

Adds an integration test that round-trips a graphql probe
through a fixture http.createServer(), verifies map: shaping,
and confirms the resolved probe value reaches a tool's exec
handler at request time via Mustache.

Lands the Plan 5 complete handoff under .handoffs/, naming Plan 6
(resources, prompts, completions, tasks) as next.

Plan 5 is complete with this commit: probes: top-level block,
fail-fast at boot, per-probe timeout, parallel independent
fetch, dual surface across Mustache and JSONLogic. No new
runtime deps.
```

- [ ] **Step 3: Stage with specific paths**

Stage:

```
git add examples/probes.yaml justfile tests/integration.test.ts \
        .handoffs/<YYYY-MM-DD-HHMM>-jig-runtime-plan5-complete.md
```

Clay: `gtxt && git pm`

Expected: Phase 5 lands on main. Plan 5 closes.

---

## Self-Review Checklist (run this once, at drafting time)

- [x] **Spec coverage.** Every section of the design doc is addressed:
  - YAML schema → Phase 1 (Tasks 1.1–1.4)
  - Type definitions → Phase 1 (Task 1.1)
  - Validator rules (exactly-one handler, unknown keys, name regex, timeout, map: deferred) → Phase 1 (Tasks 1.3, 1.4)
  - `resolveProbes` boot resolver with fail-fast + parallel + per-probe timeout → Phase 2
  - Per-probe context at boot (empty `args` and `probe`) → Phase 2 (Task 2.2)
  - Multi-failure stderr block + exit 1 → Phase 2 (Task 2.4)
  - InvokeContext extension + handler render-context wiring (table from design) → Phase 3
  - Boot sequence integration (resolveProbes after configureAccess, before tool registration) → Phase 4 (Task 4.1)
  - Description rendering with `{ probe }` → Phase 4 (Task 4.2)
  - Mustache value semantics (JSON.stringify objects/arrays via existing `render`) → relies on Plan 1's `render` (no new code; design doc explicitly cites this)
  - JSONLogic value semantics (raw values, dot-paths) → relies on json-logic-engine existing behavior
  - `map:` evaluates against `{ result }` only → Phase 2 (Task 2.2 + Task 2.3 test)
  - Concurrency rule (independent, parallel, no probe-to-probe) → Phase 2 (Task 2.2 always passes `probe: {}`)
  - File layout from design → matches the Phase 5 staging list

- [x] **Placeholder scan.** No "TBD", "TODO", "implement later", or "fill in details" in any task body. Every step shows the exact code, command, or file path.

- [x] **Type consistency.** Names used consistently across phases:
  - `ProbeSpec`, `ProbesConfig`, `ProbeHandler` (Phase 1) → referenced in Phase 2 resolver
  - `InvokeContext.probe: Record<string, unknown>` (Phase 3 Task 3.1) → referenced in Phase 3 Task 3.4 and Phase 4 Task 4.1
  - `resolveProbes(probes, compiledConnections)` signature (Phase 2 Task 2.2) → matches the call site in Phase 4 Task 4.1
  - `applyTransform(raw, args, probe, transform)` (Phase 3 Task 3.4 Step 3) → matches the call site update in Phase 3 Task 3.4 Step 3

- [x] **Bite-sized tasks.** Every step is one action (write a test, run it, write the implementation, run again, commit). No step bundles multiple unrelated changes.

- [x] **TDD discipline.** Phase 1 (Task 1.2 RED before Task 1.3 GREEN), Phase 2 (Task 2.1 RED before Task 2.2 GREEN), Phase 3 (Task 3.1 typecheck-RED before Task 3.2 GREEN), Phase 4 (Task 4.3 test paired with Task 4.1/4.2 implementation).

- [x] **Out-of-scope clarity.** The Scope Note enumerates every deferred item and where it goes (Plan 6+, ADR-0011 follow-up, future plan).
