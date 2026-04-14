# jig Runtime — Plan 4 (connections + http + graphql)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add outbound network access to the jig runtime through three new surfaces: a `connections:` block that names upstream endpoints with credentials once, an `http:` handler that consumes them for REST-style requests, and a `graphql:` handler that layers GraphQL semantics (error auto-detection) on top. Extend ADR-0009's deny-by-default security posture to network hosts and introduce a `${VAR}` shim that expands into JSONLogic `env.get` calls inside `connections:` strings.

**Architecture:** Seven new runtime surfaces land in order. (1) `src/runtime/util/interpolate.ts` implements the `${VAR}` → JSONLogic pre-pass per [ADR-0011](../decisions/0011-var-shim-for-connection-strings.md). (2) `src/runtime/connections.ts` parses the `connections:` block, compiles header rules, and exposes the resolved-at-boot URL/timeout plus the per-request header resolver. (3) `src/runtime/util/access.ts` grows `isHostAllowed` and an extended `configureAccess` signature per [ADR-0010](../decisions/0010-network-host-confinement.md). (4) `src/runtime/util/fetch.ts` is the fetch wrapper: host check, `AbortSignal` timeout, 4xx/5xx → `isError`, envelope construction. (5) `src/runtime/handlers/http.ts` is the HTTP handler (method/path/query/body/headers, response modes). (6) `src/runtime/handlers/graphql.ts` is the GraphQL handler built on the same fetch wrapper with GraphQL error auto-detection. (7) An example + `smoke-http` recipe + integration test round-trip the whole chain.

**Tech Stack:** No new production dependencies — Node 22+'s built-in `fetch` and `AbortSignal` cover the v1 surface. TypeScript 6.0+, `node:test`, `yaml`, existing `json-logic-engine@5.x` from Plan 3 all unchanged.

---

## Scope Note

This is **plan 4 of ~7** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)) and the more recent [Plan 4 design doc](../designs/2026-04-14-plan4-connections-http-graphql.md).

**Planned sequence:**

1. Plan 1 — smoke test (merged) — stdio MCP + inline tool
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. **Plan 4 — connections + http + graphql** (this plan)
5. Plan 5 — probes (startup-time data fetches with `{{probe.NAME}}` surface)
6. Plan 6 — resources (+ watchers), prompts, completions, tasks (state machines)
7. Plan 7 — CLI (`jig new|dev|validate|build`) + build pipeline (esbuild single-file, `.mcpb`, `extension_points:`, HTTP transport)

**Out of scope for Plan 4 (carried to later plans):**

- `probes:` block and `{{probe.NAME}}` surface. Plan 5. Implication: handler shapes land first so probes can consume them as a stable target.
- HEAD and OPTIONS HTTP methods. Expected in a point release once v1 lands.
- Form-urlencoded bodies, multipart. Add `body: { form: {...} }` / `body: { multipart: [...] }` when real users ask.
- Retries. Authors wrap with `dispatch:` + `compute:` when needed; built-in retry is a v0.2+ decision once traffic patterns inform the default.
- Connection pooling tuning, keep-alive overrides. Node `fetch` defaults are fine for v1.
- TLS client certs, mTLS. Future security work.
- OAuth flows. `--with-oauth` is a v0.2/v0.3 item per the master design doc.
- Streaming responses. MCP text blocks aren't streaming-friendly yet.
- `extension_points: connections: merge` — deferred until sibling-YAML composition lands.
- Author-registered custom helpers (still fixed at 16 per ADR-0008).

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **Quarantine holds.** SDK imports (`@modelcontextprotocol/*`) stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. Nothing in Plan 4 imports from the SDK.
- **Deny-by-default.** Every new network surface refuses to reach a host the allowlist does not cover. Unit tests assert the deny paths.
- **No new runtime deps.** Node 22+ `fetch` covers the surface. Adding a third-party HTTP client re-opens the single-file-no-deps question and needs its own ADR.
- **Handler errors are `isError` tool results, not protocol errors.** 4xx/5xx, network failures, timeouts, and host-deny all become `isError: true` with a descriptive text message. Never throws that bubble through the JSON-RPC layer as protocol errors.
- **Five gates must all pass before commit.** `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute` — typecheck catches structural mismatches, the three existing smoke recipes stay green through all phases. Phase 7 adds `just smoke-http` as the sixth gate.
- **Commits via `commit.txt`.** Every commit step writes the message to `commit.txt`; Clay runs `gtxt` (`git commit -F commit.txt && rm commit.txt`) and `git pm` (push + PR + auto-merge). Never `git commit` directly.
- **Feature branch per phase.** `feat/plan4-doc`, `feat/plan4-interpolate`, `feat/plan4-connections`, `feat/plan4-network-access`, `feat/plan4-fetch`, `feat/plan4-http`, `feat/plan4-graphql`, `feat/plan4-complete`. Each phase lands on main before the next starts.
- **Integration tests carry `{ timeout: 10_000 }`.** Subprocess-based tests hang forever on bugs without it.

## File Structure

```
jig/
  record/
    plans/
      2026-04-14-jig-runtime-plan4.md   # this plan (Phase 0)
    designs/
      2026-04-14-plan4-connections-http-graphql.md  # the spec (already merged)
    decisions/
      0010-network-host-confinement.md  # ADR-0010 (already merged)
      0011-var-shim-for-connection-strings.md  # ADR-0011 (already merged)
  src/
    runtime/
      util/
        interpolate.ts                  # ${VAR} → JSONLogic pre-pass (Phase 1)
        access.ts                       # + isHostAllowed, + configureAccess(connections) (Phase 3)
        fetch.ts                        # fetch wrapper: host check + timeout + envelope (Phase 4)
      handlers/
        http.ts                         # http handler (Phase 5)
        graphql.ts                      # graphql handler (Phase 6)
        index.ts                        # + http/graphql arms in invoke() (Phases 5, 6)
      connections.ts                    # schema validation + header compilation (Phase 2)
      config.ts                         # + ConnectionsConfig, NetworkSecurity, HttpHandler, GraphqlHandler (Phases 2, 5, 6)
      index.ts                          # + boot sequence extensions (Phase 3)
  tests/
    interpolate.test.ts                 # shim unit tests (Phase 1)
    connections.test.ts                 # connections schema + header compile (Phase 2)
    access-network.test.ts              # isHostAllowed + inference (Phase 3)
    fetch-util.test.ts                  # fetch wrapper unit tests (Phase 4)
    handlers.test.ts                    # + http + graphql handler tests (Phases 5, 6)
    config.test.ts                      # + connections / network parsing (Phase 2)
    integration.test.ts                 # + http + graphql round-trip over stdio (Phase 7)
  examples/
    http-and-graphql.yaml               # Phase 7
  justfile                              # new `smoke-http` recipe (Phase 7)
```

**Not in Plan 4:** anything under `src/runtime/handlers/probe.ts`, `src/runtime/probes.ts`, `src/runtime/resources.ts`, `prompts.ts`, `tasks.ts`, `transports/http.ts`, `src/cli/`. Those arrive in later plans.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 4 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `feat/plan4-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 4 (connections + http + graphql)

Phase 0 of jig runtime Plan 4 — the plan doc itself. Subsequent phases
land on feat/plan4-interpolate, feat/plan4-connections,
feat/plan4-network-access, feat/plan4-fetch, feat/plan4-http,
feat/plan4-graphql, feat/plan4-complete.

Plan 4 delivers: connections: block that names upstream endpoints once
with credentials; http: handler for REST-style requests; graphql:
handler with GraphQL error auto-detection; ${VAR} shim that expands
into JSONLogic env.get per ADR-0011; network host confinement per
ADR-0010 extending ADR-0009's deny-by-default posture.

Out of scope per the scope note: probes (Plan 5); HEAD/OPTIONS methods;
form-urlencoded body; retries; TLS client certs; OAuth.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

Expected: Plan 4 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: `${VAR}` shim (`src/runtime/util/interpolate.ts`)

**Intent:** Land the pre-pass that expands `${VAR}` tokens inside string values into JSONLogic `env.get` calls (wrapped with `cat` when surrounding text is present) per [ADR-0011](../decisions/0011-var-shim-for-connection-strings.md). Pure function, zero dependencies, all tests co-located. This is the building block Phase 2 calls when parsing `connections:` strings.

**Branch:** `feat/plan4-interpolate`

### Task 1.1: Write the first failing test — no-token passthrough

**Files:**
- Create: `tests/interpolate.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { expandShim } from "../src/runtime/util/interpolate.ts";

test("expandShim returns the literal string when there are no ${...} tokens", () => {
  assert.equal(expandShim("https://api.linear.app/graphql"), "https://api.linear.app/graphql");
  assert.equal(expandShim(""), "");
  assert.equal(expandShim("Bearer"), "Bearer");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="expandShim returns the literal"`
Expected: FAIL — `Cannot find module '../src/runtime/util/interpolate.ts'`.

### Task 1.2: Scaffold `interpolate.ts` so the first test passes

**Files:**
- Create: `src/runtime/util/interpolate.ts`

- [ ] **Step 1: Write the minimal module**

```typescript
import type { JsonLogicRule } from "./jsonlogic.ts";

/**
 * Expand ${VAR} tokens inside a string into a JSONLogic AST that calls
 * env.get. Scope: connection-string values only, invoked by the
 * connections: parser per ADR-0011.
 *
 * Rules:
 *   - No ${...} tokens → return the input string unchanged.
 *   - One bare ${VAR} (nothing else) → return {"env.get":["VAR"]}.
 *   - Multi-token or token + surrounding text → return {"cat": [...]}
 *     with literal string segments interleaved between env.get calls.
 *   - Malformed tokens (${1BAD}, unclosed ${) → passed through literally.
 */
export function expandShim(input: string): string | JsonLogicRule {
  if (!input.includes("${")) return input;
  // Phase 1 fills in the rest in later tasks.
  return input;
}
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="expandShim returns the literal"`
Expected: PASS.

### Task 1.3: Add the bare-token test

**Files:**
- Modify: `tests/interpolate.test.ts`

- [ ] **Step 1: Append the test**

```typescript
test("expandShim returns a bare env.get rule for a single ${VAR} with no surrounding text", () => {
  assert.deepEqual(expandShim("${LINEAR_API_TOKEN}"), {
    "env.get": ["LINEAR_API_TOKEN"],
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --test-name-pattern="bare env.get"`
Expected: FAIL — received `"${LINEAR_API_TOKEN}"` (the literal string passes through).

### Task 1.4: Implement bare-token expansion

**Files:**
- Modify: `src/runtime/util/interpolate.ts`

- [ ] **Step 1: Add the tokenizer and bare-token branch**

Replace the body of `expandShim` with:

```typescript
const tokenRegex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandShim(input: string): string | JsonLogicRule {
  if (!input.includes("${")) return input;

  const matches = [...input.matchAll(tokenRegex)];
  if (matches.length === 0) return input;

  // Bare-token short-circuit: the whole string IS a single ${VAR}.
  if (matches.length === 1) {
    const m = matches[0]!;
    if (m[0] === input) {
      return { "env.get": [m[1]!] };
    }
  }

  // Multi-token or surrounded path handled in the next task.
  return input;
}
```

- [ ] **Step 2: Run to verify passes**

Run: `npm test -- --test-name-pattern="bare env.get"`
Expected: PASS.

### Task 1.5: Add the multi-token test

**Files:**
- Modify: `tests/interpolate.test.ts`

- [ ] **Step 1: Append**

```typescript
test("expandShim wraps single-token-with-prefix in cat", () => {
  assert.deepEqual(expandShim("Bearer ${LINEAR_API_TOKEN}"), {
    cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
  });
});

test("expandShim handles multi-token composition", () => {
  assert.deepEqual(
    expandShim("${JIG_PROTOCOL}://${JIG_HOST}:${JIG_PORT}"),
    {
      cat: [
        { "env.get": ["JIG_PROTOCOL"] },
        "://",
        { "env.get": ["JIG_HOST"] },
        ":",
        { "env.get": ["JIG_PORT"] },
      ],
    },
  );
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `npm test -- --test-name-pattern="cat|multi-token"`
Expected: FAIL — both currently return the input string unchanged.

### Task 1.6: Implement multi-token expansion

**Files:**
- Modify: `src/runtime/util/interpolate.ts`

- [ ] **Step 1: Fill in the `cat` construction**

Replace the `// Multi-token or surrounded path handled in the next task.` block with:

```typescript
  // General case: split on tokens, interleave literal segments with
  // env.get calls, emit {"cat": [...]} with leading/trailing empties
  // removed.
  const parts: (string | JsonLogicRule)[] = [];
  let cursor = 0;
  for (const m of matches) {
    const start = m.index!;
    if (start > cursor) parts.push(input.slice(cursor, start));
    parts.push({ "env.get": [m[1]!] });
    cursor = start + m[0].length;
  }
  if (cursor < input.length) parts.push(input.slice(cursor));

  // Drop any empty-string segments that snuck in.
  const cleaned = parts.filter((p) => !(typeof p === "string" && p.length === 0));
  if (cleaned.length === 1) {
    const only = cleaned[0]!;
    return typeof only === "string" ? only : only;
  }
  return { cat: cleaned };
```

- [ ] **Step 2: Run tests to verify**

Run: `npm test -- --test-name-pattern="cat|multi-token"`
Expected: PASS (both tests).

### Task 1.7: Add the malformed-token passthrough test

**Files:**
- Modify: `tests/interpolate.test.ts`

- [ ] **Step 1: Append**

```typescript
test("expandShim leaves malformed tokens literal", () => {
  // digit-leading name is invalid shell identifier — pass through.
  assert.equal(expandShim("${1BAD}"), "${1BAD}");
  // unclosed ${ — pass through.
  assert.equal(expandShim("${OPEN"), "${OPEN");
  // literal $ with no { — pass through.
  assert.equal(expandShim("price: $5"), "price: $5");
});

test("expandShim handles mixed literal and valid token", () => {
  // only the valid token expands; literal $ survives.
  assert.deepEqual(expandShim("$5 fee + ${REGION}"), {
    cat: ["$5 fee + ", { "env.get": ["REGION"] }],
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `npm test -- --test-name-pattern="malformed|mixed literal"`
Expected: PASS. The tokenRegex rejects digit-leading names and unclosed braces, so these fall through the `matches.length === 0` guard and return the input unchanged.

### Task 1.8: Add an object-walker helper for Phase 2's use

**Files:**
- Modify: `src/runtime/util/interpolate.ts`

The parser in Phase 2 needs to walk an arbitrary JSON-ish object and replace every string leaf with the shim's result. Landing that walker alongside the shim keeps the module self-contained and testable.

- [ ] **Step 1: Append the walker function**

At the bottom of `src/runtime/util/interpolate.ts`, add:

```typescript
/**
 * Recursively walk a value and apply expandShim to every string leaf.
 * Arrays walk element-wise; objects walk value-wise. Non-string, non-
 * array, non-object values pass through unchanged. Used by the
 * connections: parser to expand ${VAR} tokens before compilation.
 */
export function expandShimInTree(value: unknown): unknown {
  if (typeof value === "string") return expandShim(value);
  if (Array.isArray(value)) return value.map(expandShimInTree);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandShimInTree(v);
    }
    return out;
  }
  return value;
}
```

- [ ] **Step 2: Add walker tests**

Append to `tests/interpolate.test.ts`:

```typescript
import { expandShimInTree } from "../src/runtime/util/interpolate.ts";

test("expandShimInTree expands strings inside a nested object", () => {
  const input = {
    url: "https://api.linear.app/graphql",
    headers: {
      Authorization: "Bearer ${LINEAR_API_TOKEN}",
      "X-Org": "${JIG_ORG}",
    },
    timeout_ms: 30000,
  };
  const result = expandShimInTree(input);
  assert.deepEqual(result, {
    url: "https://api.linear.app/graphql",
    headers: {
      Authorization: {
        cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
      },
      "X-Org": { "env.get": ["JIG_ORG"] },
    },
    timeout_ms: 30000,
  });
});

test("expandShimInTree walks arrays", () => {
  const result = expandShimInTree([
    "literal",
    "${A}",
    ["${B}", 42],
  ]);
  assert.deepEqual(result, [
    "literal",
    { "env.get": ["A"] },
    [{ "env.get": ["B"] }, 42],
  ]);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --test-name-pattern="expandShimInTree"`
Expected: PASS.

### Task 1.9: Final gate + commit

- [ ] **Step 1: Run full gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: clean across all five gates. The new `interpolate.test.ts` suite passes; no existing tests break.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): ${VAR} shim for connection-string interpolation (ADR-0011)

Adds src/runtime/util/interpolate.ts implementing the ${VAR} shim per
ADR-0011: string values with ${VAR} tokens expand into JSONLogic
env.get calls, wrapped in cat when surrounding text is present. No-
token strings pass through unchanged; malformed tokens (digit-leading
names, unclosed braces) also pass through literally.

Exports expandShim (string-level) and expandShimInTree (object
walker) — Phase 2's connections: parser uses the tree walker to
rewrite header values before compilation.

No runtime wiring yet — the shim is a pure function with a focused
test suite in tests/interpolate.test.ts.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 1 lands on main.

---

## Phase 2: `connections:` schema + compilation (`src/runtime/connections.ts`, `config.ts`)

**Intent:** Parse the `connections:` block and `server.security.network.allow` from YAML, apply the `${VAR}` shim to connection string values, compile header rules to JSONLogic AST cached for per-request evaluation. Add `ConnectionsConfig` and `NetworkSecurity` types. No runtime wiring (handlers don't exist yet); this phase is purely the schema + compilation pipeline.

**Branch:** `feat/plan4-connections`

### Task 2.1: Write the failing test — connections parse + shim expansion

**Files:**
- Create: `tests/connections.test.ts`

- [ ] **Step 1: Write the first tests**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config parses a connections: block and expands ${VAR} in headers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  linear_api:
    url: https://api.linear.app/graphql
    headers:
      Authorization: "Bearer \${LINEAR_API_TOKEN}"
    timeout_ms: 30000
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.connections, "connections: should be present on config");
  const linear = cfg.connections["linear_api"]!;
  assert.equal(linear.url, "https://api.linear.app/graphql");
  assert.equal(linear.timeout_ms, 30000);
  // Authorization header should be a JSONLogic rule after shim expansion.
  assert.deepEqual(linear.headers!["Authorization"], {
    cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
  });
});

test("config accepts an empty connections: block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: {}
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.connections, {});
});

test("config omits connections when the YAML has no block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.connections, undefined);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- --test-name-pattern="connections"`
Expected: FAIL — `connections` doesn't exist on `JigConfig` yet; type error surfaces at `cfg.connections`.

### Task 2.2: Add the `ConnectionsConfig` types to `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add imports + types near the top**

After the existing `import type { JsonLogicRule }` line, add:

```typescript
/**
 * A single upstream connection. URL and timeout are static (resolved at
 * boot). Headers may be static strings OR JSONLogic rules (the result
 * of ${VAR} shim expansion or an author-authored rule). Compilation to
 * cached rules happens in src/runtime/connections.ts at boot.
 */
export interface ConnectionDefinition {
  url: string;
  headers?: Record<string, string | JsonLogicRule>;
  timeout_ms?: number;
}

export type ConnectionsConfig = Record<string, ConnectionDefinition>;
```

- [ ] **Step 2: Extend `JigConfig`**

Replace the existing `JigConfig` interface:

```typescript
export interface JigConfig {
  server: ServerMetadata;
  tools: ToolDefinition[];
  connections?: ConnectionsConfig;
}
```

- [ ] **Step 3: Wire parse through `parseConfig`**

Replace the body of `parseConfig`:

```typescript
export function parseConfig(yamlText: string): JigConfig {
  const raw = parseYaml(yamlText) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("config: YAML root must be a mapping");
  }
  const obj = raw as Record<string, unknown>;

  const server = validateServer(obj["server"]);
  const tools = validateTools(obj["tools"]);
  const connections = validateConnections(obj["connections"]);

  const result: JigConfig = { server, tools };
  if (connections !== undefined) result.connections = connections;
  return result;
}
```

- [ ] **Step 4: Write `validateConnections`**

Append to `config.ts`:

```typescript
import { expandShimInTree } from "./util/interpolate.ts";

function validateConnections(v: unknown): ConnectionsConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: connections must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: ConnectionsConfig = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: connections.${name} must be a mapping`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e["url"] !== "string" || e["url"].length === 0) {
      throw new Error(`config: connections.${name}.url must be a non-empty string`);
    }
    const url = e["url"];
    const def: ConnectionDefinition = { url };

    if (e["headers"] !== undefined) {
      if (!e["headers"] || typeof e["headers"] !== "object" || Array.isArray(e["headers"])) {
        throw new Error(`config: connections.${name}.headers must be a mapping`);
      }
      // Apply ${VAR} shim to every string value in headers.
      const expanded = expandShimInTree(e["headers"]) as Record<string, unknown>;
      def.headers = expanded as Record<string, string | JsonLogicRule>;
    }

    if (e["timeout_ms"] !== undefined) {
      if (typeof e["timeout_ms"] !== "number" || !Number.isFinite(e["timeout_ms"]) || e["timeout_ms"] <= 0) {
        throw new Error(`config: connections.${name}.timeout_ms must be a positive number`);
      }
      def.timeout_ms = e["timeout_ms"];
    }

    // Reject unknown keys so typos fail loud.
    const known = new Set(["url", "headers", "timeout_ms"]);
    for (const key of Object.keys(e)) {
      if (!known.has(key)) {
        throw new Error(`config: connections.${name}: unknown key "${key}"`);
      }
    }

    out[name] = def;
  }
  return out;
}
```

- [ ] **Step 5: Run the Task 2.1 tests to verify**

Run: `npm test -- --test-name-pattern="connections"`
Expected: PASS.

### Task 2.3: Extend `SecurityConfig` with `NetworkSecurity`

**Files:**
- Modify: `src/runtime/util/access.ts`, `src/runtime/config.ts`

- [ ] **Step 1: Add the type to `access.ts`**

In `src/runtime/util/access.ts`, after `export interface EnvSecurity`:

```typescript
export interface NetworkSecurity {
  allow?: string[];
}
```

Update `SecurityConfig`:

```typescript
export interface SecurityConfig {
  filesystem?: FilesystemSecurity;
  env?: EnvSecurity;
  network?: NetworkSecurity;
}
```

- [ ] **Step 2: Extend `validateSecurity` in `config.ts`**

Update the `knownKeys` set and add a network block after the env block in `validateSecurity`:

```typescript
  // Reject unknown top-level keys
  const knownKeys = new Set(["filesystem", "env", "network"]);
```

At the end of `validateSecurity`, before `return result`:

```typescript
  if (sec["network"] !== undefined) {
    if (!sec["network"] || typeof sec["network"] !== "object") {
      throw new Error("config: security.network must be a mapping");
    }
    const net = sec["network"] as Record<string, unknown>;
    if (net["allow"] !== undefined) {
      if (!Array.isArray(net["allow"])) {
        throw new Error("config: security.network.allow must be an array of strings");
      }
      for (const entry of net["allow"]) {
        if (typeof entry !== "string" || entry.length === 0) {
          throw new Error("config: security.network.allow entries must be non-empty strings");
        }
      }
      result.network = { allow: net["allow"] as string[] };
    } else {
      result.network = {};
    }
  }
```

- [ ] **Step 3: Add tests for network-security parsing**

Append to `tests/connections.test.ts`:

```typescript
test("config parses server.security.network.allow", () => {
  const yamlText = `
server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: ["api.linear.app", "*.github.com"]
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.server.security?.network?.allow, [
    "api.linear.app",
    "*.github.com",
  ]);
});

test("config rejects non-string entries in security.network.allow", () => {
  const yamlText = `
server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: [42]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /security\.network\.allow.*non-empty strings/);
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --test-name-pattern="security.network"`
Expected: PASS.

### Task 2.4: Schema-error tests for malformed connections

**Files:**
- Modify: `tests/connections.test.ts`

- [ ] **Step 1: Append error-case tests**

```typescript
test("config rejects connections without url", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  bad:
    headers: { X: "y" }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections\.bad\.url/);
});

test("config rejects connections with unknown keys", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  bad:
    url: https://example.com
    wat: "no"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections\.bad: unknown key "wat"/);
});

test("config rejects connections with non-positive timeout_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  bad:
    url: https://example.com
    timeout_ms: 0
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /timeout_ms.*positive/);
});

test("config rejects connections as an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: [1, 2]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections.*mapping/);
});
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="rejects connections"`
Expected: PASS.

### Task 2.5: Create `src/runtime/connections.ts` — header compilation + resolver

**Files:**
- Create: `src/runtime/connections.ts`

The compilation layer pre-compiles header values that are JSONLogic rules into cached forms that `evaluate()` can execute per-request, and exposes a resolver that returns the resolved headers for a given connection name. Phase 5's HTTP handler calls this resolver before every request.

- [ ] **Step 1: Write the module**

```typescript
import type { ConnectionsConfig, ConnectionDefinition } from "./config.ts";
import { evaluate, type JsonLogicRule } from "./util/jsonlogic.ts";

/**
 * A compiled connection — URL + timeout_ms resolved at boot; headers
 * split into literal strings and JSONLogic rules. Per-request resolution
 * evaluates each rule against an empty context (connections don't see
 * tool-call args) and combines with literal strings into a final
 * Record<string, string>.
 */
export interface CompiledConnection {
  url: string;
  timeout_ms?: number;
  headers: CompiledHeader[];
}

type CompiledHeader =
  | { kind: "literal"; name: string; value: string }
  | { kind: "rule"; name: string; rule: JsonLogicRule };

export function compileConnections(
  raw: ConnectionsConfig,
): Record<string, CompiledConnection> {
  const out: Record<string, CompiledConnection> = {};
  for (const [name, def] of Object.entries(raw)) {
    out[name] = compileOne(def);
  }
  return out;
}

function compileOne(def: ConnectionDefinition): CompiledConnection {
  const headers: CompiledHeader[] = [];
  if (def.headers) {
    for (const [hname, hval] of Object.entries(def.headers)) {
      if (typeof hval === "string") {
        headers.push({ kind: "literal", name: hname, value: hval });
      } else {
        headers.push({ kind: "rule", name: hname, rule: hval });
      }
    }
  }
  const result: CompiledConnection = { url: def.url, headers };
  if (def.timeout_ms !== undefined) result.timeout_ms = def.timeout_ms;
  return result;
}

/**
 * Resolve a compiled connection's headers to a concrete
 * Record<string, string> for a single request. Evaluates each
 * JSONLogic rule against an empty context — connection-scoped values
 * cannot see tool-call args, by design (args belong to handlers).
 *
 * Null or undefined rule results stringify to "null"/"undefined" per
 * JSONLogic's stringify contract; authors who want fail-closed on miss
 * use env.required in their rule.
 */
export async function resolveHeaders(
  compiled: CompiledConnection,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const h of compiled.headers) {
    if (h.kind === "literal") {
      out[h.name] = h.value;
      continue;
    }
    const val = await evaluate(h.rule, {});
    out[h.name] = stringify(val);
  }
  return out;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
```

- [ ] **Step 2: Add tests**

Append to `tests/connections.test.ts`:

```typescript
import { compileConnections, resolveHeaders } from "../src/runtime/connections.ts";
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
import { join } from "node:path";

test("compileConnections splits literal and rule headers", () => {
  const raw = {
    linear_api: {
      url: "https://api.linear.app/graphql",
      headers: {
        "X-Static": "literal-value",
        Authorization: { "env.get": ["LINEAR_API_TOKEN"] },
      },
      timeout_ms: 30000,
    },
  };
  const compiled = compileConnections(raw);
  const c = compiled["linear_api"]!;
  assert.equal(c.url, "https://api.linear.app/graphql");
  assert.equal(c.timeout_ms, 30000);
  assert.equal(c.headers.length, 2);
  const staticHeader = c.headers.find((h) => h.name === "X-Static")!;
  assert.equal(staticHeader.kind, "literal");
  const authHeader = c.headers.find((h) => h.name === "Authorization")!;
  assert.equal(authHeader.kind, "rule");
});

test("resolveHeaders evaluates rule-typed headers against the env allowlist", async () => {
  resetAccessForTests();
  configureAccess(
    { env: { allow: ["JIG_HEADERS_TEST_TOKEN"] } },
    process.cwd(),
  );
  process.env["JIG_HEADERS_TEST_TOKEN"] = "sekret";
  try {
    const raw = {
      t: {
        url: "https://example.com",
        headers: {
          Authorization: {
            cat: ["Bearer ", { "env.get": ["JIG_HEADERS_TEST_TOKEN"] }],
          },
        },
      },
    };
    const compiled = compileConnections(raw);
    const resolved = await resolveHeaders(compiled["t"]!);
    assert.equal(resolved["Authorization"], "Bearer sekret");
  } finally {
    delete process.env["JIG_HEADERS_TEST_TOKEN"];
    resetAccessForTests();
  }
});

test("resolveHeaders stringifies null for env vars outside the allowlist", async () => {
  resetAccessForTests();
  configureAccess({ env: { allow: ["JIG_OTHER"] } }, process.cwd());
  try {
    const raw = {
      t: {
        url: "https://example.com",
        headers: {
          X: { "env.get": ["SOMETHING_NOT_ALLOWED"] },
        },
      },
    };
    const compiled = compileConnections(raw);
    const resolved = await resolveHeaders(compiled["t"]!);
    assert.equal(resolved["X"], "null");
  } finally {
    resetAccessForTests();
  }
});
```

- [ ] **Step 3: Run**

Run: `npm test -- --test-name-pattern="compileConnections|resolveHeaders"`
Expected: PASS.

### Task 2.6: Final gate + commit

- [ ] **Step 1: Run full gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: all five gates pass.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): connections: block schema + header compilation

Adds src/runtime/connections.ts — compiles the parsed connections:
block into CompiledConnection records where headers split into
literal strings vs. JSONLogic rules. resolveHeaders evaluates rule
headers per-request against an empty context, honoring ADR-0009's
env allowlist.

Extends src/runtime/config.ts with ConnectionsConfig,
NetworkSecurity, and the validateConnections parser. The ${VAR} shim
from Phase 1 applies to every string leaf in the headers block at
parse time, producing standard JSONLogic ASTs that the engine
already knows how to evaluate.

Schema rejections: missing/empty url, unknown keys, non-positive
timeout_ms, non-mapping connections, non-string entries in
security.network.allow.

No runtime wiring yet — handlers consume these in Phases 5 and 6.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 2 lands on main.

---

## Phase 3: Network access control (`src/runtime/util/access.ts`)

**Intent:** Extend `access.ts` with `isHostAllowed` and an updated `configureAccess` signature that accepts the parsed `connections:` block. When `security.network.allow` is unset and connections are declared, the allowlist is inferred from connection URL hostnames. When both are unset, every host denies. Per [ADR-0010](../decisions/0010-network-host-confinement.md).

**Branch:** `feat/plan4-network-access`

### Task 3.1: Write failing tests for `isHostAllowed`

**Files:**
- Create: `tests/access-network.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configureAccess,
  isHostAllowed,
  resetAccessForTests,
} from "../src/runtime/util/access.ts";

test("isHostAllowed denies every host before configureAccess runs", () => {
  resetAccessForTests();
  assert.equal(isHostAllowed("api.linear.app"), false);
});

test("isHostAllowed honors an explicit network.allow list", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["api.linear.app"] } },
    process.cwd(),
  );
  assert.equal(isHostAllowed("api.linear.app"), true);
  assert.equal(isHostAllowed("evil.com"), false);
});

test("isHostAllowed supports * wildcards", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["*.github.com", "*.foo.example"] } },
    process.cwd(),
  );
  assert.equal(isHostAllowed("api.github.com"), true);
  assert.equal(isHostAllowed("raw.github.com"), true);
  assert.equal(isHostAllowed("github.com"), false); // * requires at least one char
  assert.equal(isHostAllowed("bar.foo.example"), true);
});

test("isHostAllowed infers the allowlist from connections when network.allow is unset", () => {
  resetAccessForTests();
  configureAccess(
    {},
    process.cwd(),
    {
      linear_api: { url: "https://api.linear.app/graphql" },
      gh_api: { url: "https://api.github.com" },
    },
  );
  assert.equal(isHostAllowed("api.linear.app"), true);
  assert.equal(isHostAllowed("api.github.com"), true);
  assert.equal(isHostAllowed("evil.com"), false);
});

test("isHostAllowed denies everything when neither network.allow nor connections are declared", () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  assert.equal(isHostAllowed("api.linear.app"), false);
  assert.equal(isHostAllowed("localhost"), false);
});

test("explicit network.allow replaces (does not merge) the inferred list", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["webhook.example.com"] } },
    process.cwd(),
    { linear_api: { url: "https://api.linear.app/graphql" } },
  );
  assert.equal(isHostAllowed("webhook.example.com"), true);
  // linear's host is NOT auto-included once explicit allow is set.
  assert.equal(isHostAllowed("api.linear.app"), false);
});
```

- [ ] **Step 2: Run to verify all fail**

Run: `npm test -- --test-name-pattern="isHostAllowed|explicit network.allow"`
Expected: FAIL — `isHostAllowed` doesn't exist; `configureAccess` doesn't accept connections.

### Task 3.2: Extend `access.ts` with host allowlist

**Files:**
- Modify: `src/runtime/util/access.ts`

- [ ] **Step 1: Import the connections type**

Add to the imports at the top:

```typescript
import type { ConnectionsConfig } from "../config.ts";
```

- [ ] **Step 2: Add module state for network**

Near the existing `let allowedRoots` / `let allowedEnvPatterns` declarations:

```typescript
let allowedHostPatterns: RegExp[] | null = null;
```

- [ ] **Step 3: Extend `configureAccess` signature + body**

Replace the existing `configureAccess` function:

```typescript
export function configureAccess(
  security: SecurityConfig,
  runtimeRoot: string,
  connections?: ConnectionsConfig,
): void {
  configuredRuntimeRoot = runtimeRoot;

  // Filesystem allowlist
  const fsEntries = security.filesystem?.allow ?? [...DEFAULT_FILESYSTEM_ALLOW];
  allowedRoots = fsEntries.map((entry) => expandFsEntry(entry, runtimeRoot));

  // Env allowlist
  const envEntries = security.env?.allow ?? [...DEFAULT_ENV_ALLOW];
  allowedEnvPatterns = envEntries.map((pattern) => compileEnvPattern(pattern));

  // Network allowlist: explicit overrides inference; connections populate the
  // inferred list only when no explicit allow is set.
  if (security.network?.allow !== undefined) {
    allowedHostPatterns = security.network.allow.map((pattern) =>
      compileHostPattern(pattern),
    );
  } else if (connections !== undefined) {
    const inferred = inferHostsFromConnections(connections);
    allowedHostPatterns = inferred.map((host) => compileHostPattern(host));
  } else {
    allowedHostPatterns = [];
  }
}
```

- [ ] **Step 4: Add `compileHostPattern` + `inferHostsFromConnections` helpers**

After `compileEnvPattern`:

```typescript
/**
 * Compile a host glob pattern (only * wildcard supported). Must match
 * at least one character per wildcard, so "*.github.com" matches
 * "api.github.com" but not bare "github.com".
 */
function compileHostPattern(pattern: string): RegExp {
  if (pattern.length === 0) {
    throw new Error(`config.security.network.allow: empty pattern is not allowed`);
  }
  const invalidMeta = /[.+?^${}()|[\]\\]/;
  // We use . literally in a host, so escape it in the compiled regex.
  if (/[+?^${}()|[\]\\]/.test(pattern)) {
    throw new Error(
      `config.security.network.allow: pattern "${pattern}" contains unsupported regex metacharacters (only * is supported)`,
    );
  }
  const escaped = pattern.replace(/\./g, "\\.").replace(/\*/g, ".+");
  return new RegExp("^" + escaped + "$");
}

function inferHostsFromConnections(connections: ConnectionsConfig): string[] {
  const hosts: string[] = [];
  for (const [name, def] of Object.entries(connections)) {
    let parsed: URL;
    try {
      parsed = new URL(def.url);
    } catch {
      throw new Error(
        `config: connections.${name}.url is not a valid URL: ${def.url}`,
      );
    }
    if (!hosts.includes(parsed.hostname)) hosts.push(parsed.hostname);
  }
  return hosts;
}
```

- [ ] **Step 5: Add `isHostAllowed`**

After `isEnvAllowed`:

```typescript
/**
 * Check a hostname against the configured allowlist. Only true when
 * at least one pattern matches AND configureAccess has been called.
 */
export function isHostAllowed(hostname: string): boolean {
  if (allowedHostPatterns === null) return false;
  return allowedHostPatterns.some((pattern) => pattern.test(hostname));
}
```

- [ ] **Step 6: Extend `resetAccessForTests`**

Replace the body:

```typescript
export function resetAccessForTests(): void {
  allowedRoots = null;
  allowedEnvPatterns = null;
  allowedHostPatterns = null;
  configuredRuntimeRoot = null;
}
```

- [ ] **Step 7: Run the Task 3.1 tests**

Run: `npm test -- --test-name-pattern="isHostAllowed|explicit network.allow"`
Expected: PASS (all six tests).

### Task 3.3: Wire the boot sequence in `index.ts`

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Pass connections to configureAccess**

Replace the line `configureAccess(config.server.security ?? {}, runtimeRoot);` with:

```typescript
  configureAccess(config.server.security ?? {}, runtimeRoot, config.connections);

  // Sanity check: every declared connection's host must pass the
  // allowlist — otherwise the author set network.allow to something
  // that excludes their own connection, and every request through that
  // connection would deny. Fail fast at boot.
  if (config.connections) {
    for (const [name, def] of Object.entries(config.connections)) {
      const host = new URL(def.url).hostname;
      if (!isHostAllowed(host)) {
        throw new Error(
          `connections.${name}: host "${host}" is not in server.security.network.allow`,
        );
      }
    }
  }
```

- [ ] **Step 2: Add the `isHostAllowed` import**

Update the existing import line:

```typescript
import { configureAccess, isHostAllowed } from "./util/access.ts";
```

- [ ] **Step 3: Add a test for the sanity check**

Append to `tests/access-network.test.ts`:

```typescript
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

test(
  "boot fails when network.allow excludes a declared connection",
  { timeout: 10_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-access-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: ["webhook.example.com"]
connections:
  linear_api:
    url: https://api.linear.app/graphql
tools: []
`,
    );
    try {
      const child = spawn(
        process.execPath,
        [
          "--experimental-transform-types",
          join(process.cwd(), "src/runtime/index.ts"),
          "--config",
          configPath,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c) => (stderr += c));
      const code = await new Promise<number | null>((res) => child.on("close", res));
      assert.equal(code, 1);
      assert.match(stderr, /connections\.linear_api.*api\.linear\.app.*network\.allow/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);
```

- [ ] **Step 4: Run**

Run: `npm test -- --test-name-pattern="boot fails when network.allow excludes"`
Expected: PASS.

### Task 3.4: Final gate + commit

- [ ] **Step 1: Run full gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: all five gates pass.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): network host confinement (ADR-0010)

Extends src/runtime/util/access.ts with isHostAllowed plus a
configureAccess signature that accepts the parsed connections:
block. Per ADR-0010:

  - security.network.allow set → glob-compiled allowlist (* wildcard
    only, same compiler shape as env patterns).
  - unset + connections declared → allowlist inferred from connection
    URL hostnames.
  - unset + no connections → allowlist empty, every host denies.

Boot sequence in src/runtime/index.ts passes connections through and
sanity-checks each declared connection's host against the compiled
allowlist — an author who sets network.allow that excludes their own
connection gets a clear startup error, not a runtime deny.

No handler wiring yet — Phase 4 (fetch wrapper) is the first place
isHostAllowed gates a real request.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 3 lands on main.

---

## Phase 4: Fetch wrapper (`src/runtime/util/fetch.ts`)

**Intent:** Land the fetch wrapper that every network handler calls. Host check via `isHostAllowed`, timeout via `AbortSignal.timeout`, 4xx/5xx → `isError: true` with descriptive text, network/timeout → `isError: true`, envelope construction for `response: envelope` mode. Pure utility with no handler-specific logic.

**Branch:** `feat/plan4-fetch`

### Task 4.1: Write the fetch-wrapper interface test

**Files:**
- Create: `tests/fetch-util.test.ts`

- [ ] **Step 1: Write the spec for the wrapper**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { performFetch } from "../src/runtime/util/fetch.ts";
import {
  configureAccess,
  resetAccessForTests,
} from "../src/runtime/util/access.ts";

async function startFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((res) => server.close(() => res())),
  };
}

test("performFetch denies when the host is not allowed", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  const result = await performFetch({
    method: "GET",
    url: "http://127.0.0.1:1/",
    headers: {},
    responseMode: "body",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /host "127\.0\.0\.1" not in/);
});

test("performFetch returns body text on 2xx in body mode", async () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["127.0.0.1"] } },
    process.cwd(),
  );
  const fixture = await startFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hello");
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/",
      headers: {},
      responseMode: "body",
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0]!.text, "hello");
  } finally {
    await fixture.close();
  }
});

test("performFetch flips isError on 4xx with the status in the message", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/missing",
      headers: {},
      responseMode: "body",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /returned 404: not found/);
  } finally {
    await fixture.close();
  }
});

test("performFetch returns an envelope in envelope mode", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    res.writeHead(201, { "Content-Type": "application/json", "X-Trace": "abc" });
    res.end('{"ok":true}');
  });
  try {
    const result = await performFetch({
      method: "POST",
      url: fixture.url + "/",
      headers: {},
      responseMode: "envelope",
    });
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text) as {
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    assert.equal(parsed.status, 201);
    assert.equal(parsed.headers["x-trace"], "abc");
    assert.equal(parsed.body, '{"ok":true}');
  } finally {
    await fixture.close();
  }
});

test("performFetch errors on timeout", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    // Never respond — let the client abort.
    setTimeout(() => {
      res.writeHead(200);
      res.end("late");
    }, 2000);
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/",
      headers: {},
      responseMode: "body",
      timeoutMs: 50,
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /timeout|aborted/i);
  } finally {
    await fixture.close();
  }
});

test("performFetch forwards the method, URL, and headers", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seen: { method?: string; url?: string; hdr?: string } = {};
  const fixture = await startFixture((req, res) => {
    seen = {
      method: req.method,
      url: req.url,
      hdr: req.headers["x-test"] as string | undefined,
    };
    res.writeHead(200);
    res.end("ok");
  });
  try {
    await performFetch({
      method: "PUT",
      url: fixture.url + "/things?a=1",
      headers: { "X-Test": "t" },
      body: "payload",
      responseMode: "body",
    });
    assert.equal(seen.method, "PUT");
    assert.equal(seen.url, "/things?a=1");
    assert.equal(seen.hdr, "t");
  } finally {
    await fixture.close();
  }
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npm test -- --test-name-pattern="performFetch"`
Expected: FAIL — `performFetch` doesn't exist.

### Task 4.2: Implement `performFetch`

**Files:**
- Create: `src/runtime/util/fetch.ts`

- [ ] **Step 1: Write the wrapper**

```typescript
import { isHostAllowed } from "./access.ts";
import type { ToolCallResult } from "../handlers/types.ts";

export interface FetchRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
  responseMode: "body" | "envelope";
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Perform an outbound HTTP request and map the outcome to a
 * ToolCallResult. Called by http.ts and graphql.ts.
 *
 * Error shaping:
 *   - Host not in network allowlist → isError with host-deny message.
 *   - Network/DNS failure → isError with the underlying error message.
 *   - AbortSignal timeout → isError with "timeout after Nms".
 *   - 4xx/5xx in "body" mode → isError with status + body snippet.
 *   - 4xx/5xx in "envelope" mode → success result with the envelope;
 *     the author handles status-based branching.
 *
 * Success shaping:
 *   - "body" mode → result.content[0].text = response body.
 *   - "envelope" mode → result.content[0].text = JSON.stringify({
 *       status, headers, body }). Headers are lowercased per Node's
 *       Headers API conventions.
 */
export async function performFetch(req: FetchRequest): Promise<ToolCallResult> {
  let parsed: URL;
  try {
    parsed = new URL(req.url);
  } catch {
    return errorResult(`http: invalid url "${req.url}"`);
  }
  if (!isHostAllowed(parsed.hostname)) {
    return errorResult(
      `http: host "${parsed.hostname}" not in server.security.network.allow`,
    );
  }

  const timeout = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeout);

  let response: Response;
  try {
    response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (signal.aborted) {
      return errorResult(`http: timeout after ${timeout}ms`);
    }
    return errorResult(`http: ${msg}`);
  }

  const bodyText = await response.text();

  if (req.responseMode === "envelope") {
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: response.status,
            headers,
            body: bodyText,
          }),
        },
      ],
    };
  }

  // body mode
  if (response.status >= 400) {
    return errorResult(
      `http: ${req.method} ${req.url} returned ${response.status}: ${bodyText}`,
    );
  }
  return { content: [{ type: "text", text: bodyText }] };
}

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
```

- [ ] **Step 2: Run the Task 4.1 tests**

Run: `npm test -- --test-name-pattern="performFetch"`
Expected: PASS (all six tests).

### Task 4.3: Final gate + commit

- [ ] **Step 1: Run full gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: all five gates pass.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): fetch wrapper with host check, timeout, envelope modes

Adds src/runtime/util/fetch.ts — the single entry point every
network handler calls. Uses Node 22+ stdlib fetch and AbortSignal.

Host check fires before fetch (ADR-0010). Timeout via AbortSignal.
4xx/5xx in body mode flip isError with the status + body snippet;
envelope mode surfaces {status, headers, body} as JSON-stringified
text so authors can branch in transform:. Network errors and
timeouts produce isError with a clean message.

Unit tests run against http.createServer() fixtures — no network
calls, deterministic.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 4 lands on main.

---

## Phase 5: HTTP handler (`src/runtime/handlers/http.ts`)

**Intent:** Land the `http:` handler. Composes the connection URL + `path:`, URL-encodes `query:`, renders Mustache in string leaves of `body:` + `headers:` + `path:` + `query:` + `url:` against tool-call args, merges connection headers with handler headers (handler wins), calls `performFetch`. Wires into `invoke()`.

**Branch:** `feat/plan4-http`

### Task 5.1: Add `HttpHandler` type + validator

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the type**

After `ComputeHandler`:

```typescript
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpHandler {
  http: {
    connection?: string;
    method: HttpMethod;
    path?: string;
    url?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown; // string for raw, mapping for JSON auto-serialize
    response?: "body" | "envelope";
    timeout_ms?: number;
  };
}
```

Extend the `Handler` union:

```typescript
export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler
  | HttpHandler;
// GraphqlHandler lands in Phase 6.
```

- [ ] **Step 2: Add `validateHttp`**

In `validateHandler`, add a branch before the `throw new Error(...)`:

```typescript
  if (h["http"] && typeof h["http"] === "object") {
    return validateHttp(h["http"], toolName);
  }
```

Append `validateHttp`:

```typescript
function validateHttp(v: unknown, toolName: string): HttpHandler {
  const h = v as Record<string, unknown>;
  const method = h["method"];
  const validMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  if (typeof method !== "string" || !validMethods.has(method)) {
    throw new Error(
      `config: tools[${toolName}].handler.http.method must be one of GET, POST, PUT, PATCH, DELETE`,
    );
  }
  const connection = h["connection"];
  const url = h["url"];
  if (connection === undefined && url === undefined) {
    throw new Error(
      `config: tools[${toolName}].handler.http requires either connection or url`,
    );
  }
  if (connection !== undefined && typeof connection !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.connection must be a string`);
  }
  if (url !== undefined && typeof url !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.url must be a string`);
  }

  const out: HttpHandler = { http: { method: method as HttpMethod } };
  if (connection !== undefined) out.http.connection = connection as string;
  if (url !== undefined) out.http.url = url as string;

  for (const key of ["path", "body"]) {
    if (h[key] !== undefined) (out.http as Record<string, unknown>)[key] = h[key];
  }

  if (h["query"] !== undefined) {
    if (!h["query"] || typeof h["query"] !== "object" || Array.isArray(h["query"])) {
      throw new Error(`config: tools[${toolName}].handler.http.query must be a mapping`);
    }
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(h["query"])) {
      if (typeof v !== "string") {
        throw new Error(
          `config: tools[${toolName}].handler.http.query.${k} must be a string`,
        );
      }
      q[k] = v;
    }
    out.http.query = q;
  }

  if (h["headers"] !== undefined) {
    if (!h["headers"] || typeof h["headers"] !== "object" || Array.isArray(h["headers"])) {
      throw new Error(`config: tools[${toolName}].handler.http.headers must be a mapping`);
    }
    const hdrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(h["headers"])) {
      if (typeof v !== "string") {
        throw new Error(`config: tools[${toolName}].handler.http.headers.${k} must be a string`);
      }
      hdrs[k] = v;
    }
    out.http.headers = hdrs;
  }

  if (h["response"] !== undefined) {
    if (h["response"] !== "body" && h["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.http.response must be "body" or "envelope"`,
      );
    }
    out.http.response = h["response"] as "body" | "envelope";
  }

  if (h["timeout_ms"] !== undefined) {
    if (typeof h["timeout_ms"] !== "number" || !Number.isFinite(h["timeout_ms"]) || h["timeout_ms"] <= 0) {
      throw new Error(`config: tools[${toolName}].handler.http.timeout_ms must be a positive number`);
    }
    out.http.timeout_ms = h["timeout_ms"];
  }

  return out;
}
```

- [ ] **Step 3: Add config tests**

Append to `tests/config.test.ts`:

```typescript
test("config accepts an http handler with connection + method", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      http:
        connection: api
        method: GET
        path: "/thing"
`;
  const cfg = parseConfig(yamlText);
  const h = cfg.tools[0]!.handler as { http: { method: string; path?: string } };
  assert.equal(h.http.method, "GET");
  assert.equal(h.http.path, "/thing");
});

test("config rejects http without connection or url", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler:
      http:
        method: GET
`;
  assert.throws(() => parseConfig(yamlText), /http requires either connection or url/);
});

test("config rejects http with invalid method", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler:
      http:
        connection: api
        method: BOGUS
connections:
  api:
    url: https://example.com
`;
  assert.throws(() => parseConfig(yamlText), /http\.method/);
});
```

- [ ] **Step 4: Run**

Run: `npm test -- --test-name-pattern="http handler|http without|http with invalid"`
Expected: PASS.

### Task 5.2: Write the HTTP-handler tests

**Files:**
- Modify: `tests/handlers.test.ts`

- [ ] **Step 1: Add fixture helper at the top of the file (near existing imports)**

```typescript
import { createServer as createHttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
import { invokeHttp } from "../src/runtime/handlers/http.ts";
import { compileConnections } from "../src/runtime/connections.ts";

async function startHandlerFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
) {
  const server = createHttpServer(handler);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

- [ ] **Step 2: Add invokeHttp tests**

```typescript
test("invokeHttp GETs the composed URL and returns body", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenUrl = "";
  const fix = await startHandlerFixture((req, res) => {
    seenUrl = req.url ?? "";
    res.writeHead(200);
    res.end("body-ok");
  });
  try {
    const compiled = compileConnections({
      api: { url: fix.url },
    });
    const result = await invokeHttp(
      {
        http: { connection: "api", method: "GET", path: "/{{slug}}" },
      },
      { slug: "hello" },
      compiled,
    );
    assert.equal(result.isError, undefined);
    assert.equal(seenUrl, "/hello");
    assert.equal(result.content[0]!.text, "body-ok");
  } finally {
    await fix.close();
  }
});

test("invokeHttp merges connection + handler headers, handler wins on conflict", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenHeaders: Record<string, string | string[] | undefined> = {};
  const fix = await startHandlerFixture((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200);
    res.end("");
  });
  try {
    const compiled = compileConnections({
      api: {
        url: fix.url,
        headers: {
          "X-Connection": "conn-value",
          "X-Conflict": "conn-wins?",
        },
      },
    });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "GET",
          headers: { "X-Conflict": "handler-wins", "X-Handler": "h-{{id}}" },
        },
      },
      { id: "42" },
      compiled,
    );
    assert.equal(seenHeaders["x-connection"], "conn-value");
    assert.equal(seenHeaders["x-conflict"], "handler-wins");
    assert.equal(seenHeaders["x-handler"], "h-42");
  } finally {
    await fix.close();
  }
});

test("invokeHttp serializes a body mapping as JSON with Content-Type", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenBody = "";
  let seenCT = "";
  const fix = await startHandlerFixture((req, res) => {
    seenCT = (req.headers["content-type"] as string | undefined) ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(201);
      res.end("{}");
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "POST",
          path: "/items",
          body: { title: "{{title}}", tags: ["{{tag}}", "static"] },
        },
      },
      { title: "hello", tag: "triage" },
      compiled,
    );
    assert.match(seenCT, /application\/json/);
    const parsed = JSON.parse(seenBody) as { title: string; tags: string[] };
    assert.equal(parsed.title, "hello");
    assert.deepEqual(parsed.tags, ["triage", "static"]);
  } finally {
    await fix.close();
  }
});

test("invokeHttp sends a raw body when body is a string", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenBody = "";
  const fix = await startHandlerFixture((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200);
      res.end("");
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "POST",
          body: "key={{key}}&val={{val}}",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      },
      { key: "k", val: "v" },
      compiled,
    );
    assert.equal(seenBody, "key=k&val=v");
  } finally {
    await fix.close();
  }
});

test("invokeHttp URL-encodes query params against args", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenUrl = "";
  const fix = await startHandlerFixture((req, res) => {
    seenUrl = req.url ?? "";
    res.writeHead(200);
    res.end("");
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "GET",
          path: "/search",
          query: { q: "{{term}}", per_page: "30" },
        },
      },
      { term: "hello world" },
      compiled,
    );
    assert.match(seenUrl, /\/search\?/);
    assert.match(seenUrl, /q=hello(\+|%20)world/);
    assert.match(seenUrl, /per_page=30/);
  } finally {
    await fix.close();
  }
});

test("invokeHttp denies an unknown connection name", async () => {
  const compiled = compileConnections({});
  const result = await invokeHttp(
    { http: { connection: "missing", method: "GET" } },
    {},
    compiled,
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown connection "missing"/);
});

test("invokeHttp returns envelope when response: envelope", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(418, { "X-Trace": "t" });
    res.end("short and stout");
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeHttp(
      {
        http: { connection: "api", method: "GET", response: "envelope" },
      },
      {},
      compiled,
    );
    assert.equal(result.isError, undefined);
    const env = JSON.parse(result.content[0]!.text) as {
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    assert.equal(env.status, 418);
    assert.equal(env.body, "short and stout");
    assert.equal(env.headers["x-trace"], "t");
  } finally {
    await fix.close();
  }
});
```

- [ ] **Step 3: Run to verify failures**

Run: `npm test -- --test-name-pattern="invokeHttp"`
Expected: FAIL — `invokeHttp` and `compileConnections` have the wrong import paths; this tests the handler module that doesn't exist yet.

### Task 5.3: Implement `invokeHttp`

**Files:**
- Create: `src/runtime/handlers/http.ts`

- [ ] **Step 1: Write the handler**

```typescript
import type { HttpHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import type { CompiledConnection } from "../connections.ts";
import { resolveHeaders } from "../connections.ts";
import { performFetch } from "../util/fetch.ts";
import { render } from "../util/template.ts";

/**
 * Invoke an http handler. Composition order:
 *
 *   1. Resolve the base URL from connection or the handler's own url.
 *   2. Render path, url, query values, header values, and body string
 *      leaves through Mustache against args.
 *   3. Append path to base URL (if present). Append query string if
 *      the handler declared query.
 *   4. Resolve connection headers (ADR-0009 env allowlist applies).
 *      Merge handler headers over connection headers (handler wins).
 *   5. Serialize body: mapping → JSON + Content-Type: application/json;
 *      string → raw body, author sets content type via headers.
 *   6. Delegate to performFetch.
 */
export async function invokeHttp(
  handler: HttpHandler,
  args: Record<string, unknown>,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<ToolCallResult> {
  const spec = handler.http;

  // Step 1 — base URL
  let baseUrl: string | undefined;
  let compiledConnection: CompiledConnection | undefined;
  if (spec.connection !== undefined) {
    compiledConnection = compiledConnections[spec.connection];
    if (compiledConnection === undefined) {
      return errorResult(`http: unknown connection "${spec.connection}"`);
    }
    baseUrl = compiledConnection.url;
  }
  if (spec.url !== undefined) {
    baseUrl = render(spec.url, args);
  }
  if (baseUrl === undefined) {
    return errorResult(`http: neither connection nor url resolved to a URL`);
  }

  // Step 2 — render path + query + header values
  const pathRendered = spec.path !== undefined ? render(spec.path, args) : "";
  let fullUrl = baseUrl + pathRendered;
  if (spec.query !== undefined) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(spec.query)) {
      params.append(k, render(v, args));
    }
    const qs = params.toString();
    if (qs.length > 0) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
    }
  }

  // Step 3/4 — headers
  const connHeaders = compiledConnection
    ? await resolveHeaders(compiledConnection)
    : {};
  const mergedHeaders: Record<string, string> = { ...connHeaders };
  if (spec.headers) {
    for (const [k, v] of Object.entries(spec.headers)) {
      mergedHeaders[k] = render(v, args);
    }
  }

  // Step 5 — body
  let body: string | undefined;
  if (spec.body !== undefined) {
    if (typeof spec.body === "string") {
      body = render(spec.body, args);
    } else {
      const jsonReady = renderJsonLeaves(spec.body, args);
      body = JSON.stringify(jsonReady);
      if (mergedHeaders["Content-Type"] === undefined &&
          mergedHeaders["content-type"] === undefined) {
        mergedHeaders["Content-Type"] = "application/json";
      }
    }
  }

  // Step 6 — fetch
  const responseMode = spec.response ?? "body";
  const timeoutMs = spec.timeout_ms ?? compiledConnection?.timeout_ms;
  const fetchReq: Parameters<typeof performFetch>[0] = {
    method: spec.method,
    url: fullUrl,
    headers: mergedHeaders,
    responseMode,
  };
  if (body !== undefined) fetchReq.body = body;
  if (timeoutMs !== undefined) fetchReq.timeoutMs = timeoutMs;
  return performFetch(fetchReq);
}

/**
 * Walk a body mapping and render Mustache in every string leaf against
 * args. Non-strings pass through.
 */
function renderJsonLeaves(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === "string") return render(value, args);
  if (Array.isArray(value)) return value.map((v) => renderJsonLeaves(v, args));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderJsonLeaves(v, args);
    }
    return out;
  }
  return value;
}

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
```

- [ ] **Step 2: Run the Task 5.2 tests**

Run: `npm test -- --test-name-pattern="invokeHttp"`
Expected: PASS (all seven tests).

### Task 5.4: Wire HTTP into `invoke()`

**Files:**
- Modify: `src/runtime/handlers/index.ts`, `src/runtime/index.ts`

The handler's signature needs access to compiled connections, but `invoke()` today takes only `handler, args`. We thread compiled connections through by making `invoke()` take an options object.

- [ ] **Step 1: Extend `invoke()` signature**

Replace the whole `src/runtime/handlers/index.ts`:

```typescript
import type { Handler } from "../config.ts";
import type { CompiledConnection } from "../connections.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";
import { invokeCompute } from "./compute.ts";
import { invokeHttp } from "./http.ts";

export interface InvokeContext {
  connections: Record<string, CompiledConnection>;
}

/**
 * Route a resolved Handler to the matching handler implementation.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) {
    return invokeDispatch(handler, args, (h, a) => invoke(h, a, ctx));
  }
  if ("compute" in handler) return invokeCompute(handler, args);
  if ("http" in handler) return invokeHttp(handler, args, ctx.connections);
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
```

- [ ] **Step 2: Update `src/runtime/index.ts`**

Add the `compileConnections` import and thread compiled connections through:

```typescript
import { compileConnections } from "./connections.ts";
```

Replace the handler-registration loop:

```typescript
  const compiled = config.connections ? compileConnections(config.connections) : {};
  const ctx = { connections: compiled };

  for (const tool of config.tools) {
    const handler: ToolHandler = async (args: unknown) => {
      const normalized = normalizeArgs(args);
      const raw = await invoke(tool.handler, normalized, ctx);
      if (tool.transform === undefined) return raw;
      return applyTransform(raw, normalized, tool.transform);
    };
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
      },
      handler,
    );
  }
```

- [ ] **Step 3: Fix any existing test that calls `invoke()` directly**

Search: `grep -rn "invoke(" tests/ src/runtime/` — callers that passed `(handler, args)` need to pass `(handler, args, ctx)` where `ctx = { connections: {} }` for tests that don't exercise http.

Specifically: `tests/handlers.test.ts` likely calls `invoke` in a dispatcher-composition test; update those call sites to pass `{ connections: {} }`.

- [ ] **Step 4: Run full gates**

Run: `npm run check && npm test`
Expected: PASS. Type errors in call sites surface here; fix each until green.

### Task 5.5: Final gate + commit

- [ ] **Step 1: Run smoke gates**

Run: `just smoke && just smoke-dispatch && just smoke-compute`
Expected: all three smokes green.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): http handler (method/path/query/body/headers/response)

Adds src/runtime/handlers/http.ts — composes the connection URL with
Mustache-rendered path, query, and body; merges connection headers
with handler headers (handler wins on conflict); serializes body
mappings as JSON (auto-setting Content-Type) and strings verbatim.
response: body (default) returns the body text with 4xx/5xx flipping
isError; response: envelope returns {status, headers, body} so
authors can branch on status in transform:.

Threads compiled connections through invoke() via a new InvokeContext
parameter. Existing handler arms (inline/exec/dispatch/compute) pass
the context through unchanged.

Config validates method (GET/POST/PUT/PATCH/DELETE), requires either
connection or url, enforces string-typed query and header values,
and rejects unknown keys.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 5 lands on main.

---

## Phase 6: GraphQL handler (`src/runtime/handlers/graphql.ts`)

**Intent:** Land the `graphql:` handler. Reuses `performFetch` with a fixed POST shape (`query` + `variables` in body, `Content-Type: application/json`). Default response mode parses the GraphQL envelope and auto-detects `errors:` — a non-empty array flips `isError` with the first error message; `data:` is extracted as the result. `envelope` mode returns the raw `{data, errors, extensions}` JSON.

**Branch:** `feat/plan4-graphql`

### Task 6.1: Add `GraphqlHandler` type + validator

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the type**

After `HttpHandler`:

```typescript
export interface GraphqlHandler {
  graphql: {
    connection: string;
    query: string;
    variables?: unknown; // YAML mapping → JSON with Mustache in string leaves
    response?: "data" | "envelope";
    timeout_ms?: number;
  };
}
```

Extend the `Handler` union:

```typescript
export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler
  | HttpHandler
  | GraphqlHandler;
```

- [ ] **Step 2: Add `validateGraphql`**

In `validateHandler`, add before the final `throw`:

```typescript
  if (h["graphql"] && typeof h["graphql"] === "object") {
    return validateGraphql(h["graphql"], toolName);
  }
```

Append:

```typescript
function validateGraphql(v: unknown, toolName: string): GraphqlHandler {
  const g = v as Record<string, unknown>;
  if (typeof g["connection"] !== "string" || g["connection"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.connection must be a non-empty string`,
    );
  }
  if (typeof g["query"] !== "string" || g["query"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.query must be a non-empty string`,
    );
  }
  const out: GraphqlHandler = {
    graphql: { connection: g["connection"], query: g["query"] },
  };
  if (g["variables"] !== undefined) out.graphql.variables = g["variables"];
  if (g["response"] !== undefined) {
    if (g["response"] !== "data" && g["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.response must be "data" or "envelope"`,
      );
    }
    out.graphql.response = g["response"] as "data" | "envelope";
  }
  if (g["timeout_ms"] !== undefined) {
    if (typeof g["timeout_ms"] !== "number" || !Number.isFinite(g["timeout_ms"]) || g["timeout_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.timeout_ms must be a positive number`,
      );
    }
    out.graphql.timeout_ms = g["timeout_ms"];
  }
  return out;
}
```

- [ ] **Step 3: Add config tests**

Append to `tests/config.test.ts`:

```typescript
test("config accepts a graphql handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      graphql:
        connection: api
        query: "query { x }"
`;
  const cfg = parseConfig(yamlText);
  const h = cfg.tools[0]!.handler as { graphql: { connection: string; query: string } };
  assert.equal(h.graphql.connection, "api");
  assert.match(h.graphql.query, /^query/);
});

test("config rejects graphql without a query", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
tools:
  - name: t1
    description: x
    handler:
      graphql:
        connection: api
`;
  assert.throws(() => parseConfig(yamlText), /graphql\.query/);
});
```

- [ ] **Step 4: Run**

Run: `npm test -- --test-name-pattern="graphql handler|graphql without"`
Expected: PASS.

### Task 6.2: Write the handler tests

**Files:**
- Modify: `tests/handlers.test.ts`

- [ ] **Step 1: Add the import**

Near the other imports:

```typescript
import { invokeGraphql } from "../src/runtime/handlers/graphql.ts";
```

- [ ] **Step 2: Add tests**

```typescript
test("invokeGraphql posts query + variables as JSON to the connection URL", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenCT = "";
  let seenBody = "";
  const fix = await startHandlerFixture((req, res) => {
    seenCT = (req.headers["content-type"] as string | undefined) ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { team: { name: "Engineering" } } }));
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      {
        graphql: {
          connection: "api",
          query: "query GetTeam($id: ID!) { team(id: $id) { name } }",
          variables: { id: "{{team_id}}" },
        },
      },
      { team_id: "t-1" },
      compiled,
    );
    assert.equal(result.isError, undefined);
    assert.match(seenCT, /application\/json/);
    const parsed = JSON.parse(seenBody) as { query: string; variables: { id: string } };
    assert.match(parsed.query, /GetTeam/);
    assert.equal(parsed.variables.id, "t-1");
    // Default response: data mode extracts data.
    const data = JSON.parse(result.content[0]!.text) as { team: { name: string } };
    assert.equal(data.team.name, "Engineering");
  } finally {
    await fix.close();
  }
});

test("invokeGraphql flips isError when the response includes errors:", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      errors: [
        { message: "Field \"bogus\" is not defined" },
        { message: "secondary" },
      ],
    }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      { graphql: { connection: "api", query: "{ bogus }" } },
      {},
      compiled,
    );
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /bogus.*not defined/);
  } finally {
    await fix.close();
  }
});

test("invokeGraphql envelope mode returns data + errors + extensions", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: { partial: true },
      errors: [{ message: "partial failure" }],
      extensions: { trace: "abc" },
    }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      { graphql: { connection: "api", query: "{ partial }", response: "envelope" } },
      {},
      compiled,
    );
    assert.equal(result.isError, undefined);
    const env = JSON.parse(result.content[0]!.text) as {
      data: unknown;
      errors: { message: string }[];
      extensions: unknown;
    };
    assert.deepEqual(env.data, { partial: true });
    assert.equal(env.errors[0]!.message, "partial failure");
    assert.deepEqual(env.extensions, { trace: "abc" });
  } finally {
    await fix.close();
  }
});

test("invokeGraphql denies an unknown connection name", async () => {
  const result = await invokeGraphql(
    { graphql: { connection: "missing", query: "{ x }" } },
    {},
    compileConnections({}),
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown connection "missing"/);
});
```

- [ ] **Step 3: Run to verify failures**

Run: `npm test -- --test-name-pattern="invokeGraphql"`
Expected: FAIL — `invokeGraphql` doesn't exist.

### Task 6.3: Implement `invokeGraphql`

**Files:**
- Create: `src/runtime/handlers/graphql.ts`

- [ ] **Step 1: Write the handler**

```typescript
import type { GraphqlHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import type { CompiledConnection } from "../connections.ts";
import { resolveHeaders } from "../connections.ts";
import { performFetch } from "../util/fetch.ts";
import { render } from "../util/template.ts";

/**
 * Invoke a graphql handler. Always POSTs to the connection URL with
 * JSON body `{ query, variables? }`. Default response: "data" mode
 * extracts the `data` field and flips isError if `errors:` is non-empty.
 * "envelope" mode returns the raw `{data, errors, extensions}` JSON.
 */
export async function invokeGraphql(
  handler: GraphqlHandler,
  args: Record<string, unknown>,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<ToolCallResult> {
  const spec = handler.graphql;
  const conn = compiledConnections[spec.connection];
  if (conn === undefined) {
    return errorResult(`graphql: unknown connection "${spec.connection}"`);
  }

  const query = render(spec.query, args);
  const variables = spec.variables === undefined
    ? undefined
    : renderJsonLeaves(spec.variables, args);
  const payload: Record<string, unknown> = { query };
  if (variables !== undefined) payload["variables"] = variables;

  const connHeaders = await resolveHeaders(conn);
  const headers: Record<string, string> = { ...connHeaders };
  if (headers["Content-Type"] === undefined && headers["content-type"] === undefined) {
    headers["Content-Type"] = "application/json";
  }

  // We always fetch in envelope mode so GraphQL error-shape parsing
  // has access to the raw body even on 4xx/5xx, then project to data
  // or envelope before returning.
  const fetchReq: Parameters<typeof performFetch>[0] = {
    method: "POST",
    url: conn.url,
    headers,
    body: JSON.stringify(payload),
    responseMode: "envelope",
  };
  if (spec.timeout_ms !== undefined) fetchReq.timeoutMs = spec.timeout_ms;
  else if (conn.timeout_ms !== undefined) fetchReq.timeoutMs = conn.timeout_ms;

  const raw = await performFetch(fetchReq);
  if (raw.isError) return raw; // host-deny / timeout / network fail

  const envText = raw.content[0]!.text;
  let envelope: { status: number; headers: Record<string, string>; body: string };
  try {
    envelope = JSON.parse(envText) as typeof envelope;
  } catch {
    return errorResult(`graphql: malformed fetch envelope: ${envText}`);
  }

  let parsed: { data?: unknown; errors?: unknown; extensions?: unknown };
  try {
    parsed = JSON.parse(envelope.body) as typeof parsed;
  } catch {
    return errorResult(
      `graphql: response body is not JSON (status ${envelope.status}): ${envelope.body}`,
    );
  }

  const mode = spec.response ?? "data";
  if (mode === "envelope") {
    return {
      content: [
        { type: "text", text: JSON.stringify(parsed) },
      ],
    };
  }

  // data mode
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const first = parsed.errors[0] as { message?: unknown };
    const msg = typeof first?.message === "string" ? first.message : JSON.stringify(first);
    return errorResult(`graphql: ${msg}`);
  }
  const data = parsed.data ?? null;
  return {
    content: [
      { type: "text", text: typeof data === "string" ? data : JSON.stringify(data) },
    ],
  };
}

function renderJsonLeaves(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === "string") return render(value, args);
  if (Array.isArray(value)) return value.map((v) => renderJsonLeaves(v, args));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderJsonLeaves(v, args);
    }
    return out;
  }
  return value;
}

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
```

- [ ] **Step 2: Wire into `invoke()`**

Modify `src/runtime/handlers/index.ts`:

```typescript
import { invokeGraphql } from "./graphql.ts";
```

Add the arm:

```typescript
  if ("graphql" in handler) return invokeGraphql(handler, args, ctx.connections);
```

- [ ] **Step 3: Run the Task 6.2 tests**

Run: `npm test -- --test-name-pattern="invokeGraphql"`
Expected: PASS (all four tests).

### Task 6.4: Final gate + commit

- [ ] **Step 1: Run full gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: all five gates pass.

- [ ] **Step 2: Write `commit.txt`**

```
feat(runtime): graphql handler with error auto-detect

Adds src/runtime/handlers/graphql.ts — always POSTs {query, variables}
as JSON to the connection URL. Default response: "data" extracts the
data field; a non-empty errors: array flips isError with the first
error message. response: "envelope" returns the raw
{data, errors, extensions} JSON so authors can handle partial-data
responses.

Reuses the Phase 4 fetch wrapper for host check, timeout, network
error shaping. Content-Type: application/json applies unless the
connection declares otherwise.

Config validates connection + query as required non-empty strings,
enforces "data" | "envelope" on response, positive timeout_ms.
```

- [ ] **Step 3: Clay runs `gtxt` + `git pm`**

Expected: Phase 6 lands on main.

---

## Phase 7: Example + smoke-http + integration + handoff

**Intent:** Add `examples/http-and-graphql.yaml` — a tool that exercises http, graphql, dispatch, `when:` guards, and transform together. Add `just smoke-http` with a recipe-spawned fixture server. Add an integration test that round-trips the full chain over stdio. Write the Plan 4 complete handoff.

**Branch:** `feat/plan4-complete`

### Task 7.1: Write `examples/http-and-graphql.yaml`

**Files:**
- Create: `examples/http-and-graphql.yaml`

- [ ] **Step 1: Write the example**

```yaml
# A Plan 4 example that exercises connections + http + graphql
# together with dispatch and transform. Demonstrates:
#   - connections: declaring two upstream endpoints, one for REST and
#     one for GraphQL, with ${VAR} env interpolation in headers
#   - http: GET composing path + query against args
#   - graphql: POST with variables built from args
#   - transform: wrapping every response in a uniform envelope
#
# Run with just smoke-http (spins up a fixture server the recipe hosts)
# or against a real environment where JIG_EXAMPLE_TOKEN points at a
# valid API token and the allowlists cover api.example.invalid.

server:
  name: jig-plan4-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 4: connections, http handler, graphql handler,
    network host confinement, and ${VAR} shim. Plan 4 smoke target.

  security:
    env:
      allow:
        - "JIG_*"
    # network.allow is omitted: allowlist is inferred from connections
    # below. api.example.invalid is the only reachable host until a
    # different allowlist is declared.

connections:
  rest_api:
    url: https://api.example.invalid
    headers:
      Accept: "application/json"
      Authorization: "Bearer ${JIG_EXAMPLE_TOKEN}"
    timeout_ms: 5000
  graph_api:
    url: https://api.example.invalid/graphql
    headers:
      Authorization: "Bearer ${JIG_EXAMPLE_TOKEN}"
    timeout_ms: 5000

tools:
  - name: example
    description: |
      Actions:
        list       → GET /items?limit=10 via rest_api
        show       → GET /items/{{id}} via rest_api, requires id
        create     → POST /items via rest_api with a JSON body
        search     → graphql: query($term: String!) { search(term: $term) }
        help       → inline text listing the actions

    input:
      action:
        type: string
        required: true
      id:
        type: string
      term:
        type: string
      title:
        type: string

    handler:
      dispatch:
        on: action
        cases:
          list:
            handler:
              http:
                connection: rest_api
                method: GET
                path: "/items"
                query: { limit: "10" }

          show:
            requires: [id]
            handler:
              http:
                connection: rest_api
                method: GET
                path: "/items/{{id}}"

          create:
            requires: [title]
            handler:
              http:
                connection: rest_api
                method: POST
                path: "/items"
                body:
                  title: "{{title}}"
                  source: "jig"

          search:
            requires: [term]
            handler:
              graphql:
                connection: graph_api
                query: |
                  query Search($term: String!) { search(term: $term) { id name } }
                variables:
                  term: "{{term}}"

          help:
            handler:
              inline:
                text: |
                  example: { list | show | create | search | help }
                    list               no args
                    show               requires id
                    create             requires title
                    search             requires term
                    help               always valid

    transform:
      cat:
        - "["
        - { "var": "args.action" }
        - "] "
        - { "var": "result" }
```

### Task 7.2: Add `just smoke-http`

**Files:**
- Modify: `justfile`

The smoke recipe spawns a small Node fixture server on a random port, sets `JIG_EXAMPLE_TOKEN` + overrides `connections.rest_api.url` via a second YAML that extends the example, sends tools/call for `help` (doesn't need network) and for `list` (hits the fixture).

For Plan 4 we keep the recipe surface minimal: the recipe runs `help` only (no network). The integration test in Task 7.3 covers the real round-trip against an in-process fixture.

- [ ] **Step 1: Append the recipe**

Append to `justfile`:

```just
# Smoke-http: verify the Plan 4 example loads and the help action
# returns through dispatch + transform. Does not reach the network —
# network round-trips are exercised by the Plan 4 integration test
# which spins up an http.createServer() fixture.
smoke-http:
    #!/usr/bin/env bash
    set -euo pipefail
    export JIG_EXAMPLE_TOKEN=dummy-token-for-smoke
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"example","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/http-and-graphql.yaml)
    if [ -z "$output" ]; then
      echo "smoke-http: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -1 | jq .
```

- [ ] **Step 2: Run it**

Run: `just smoke-http`
Expected: JSON-RPC response with `content[0].text` wrapped by transform as `[help] example: { list | ... }`.

### Task 7.3: Integration test — http + graphql round-trip

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the test**

```typescript
import { createServer as createHttpServerInt } from "node:http";
import { AddressInfo as AddressInfoInt } from "node:net";

test(
  "http + graphql round-trip over stdio",
  { timeout: 15_000 },
  async () => {
    // Fixture server serves /items/* and /graphql.
    const seen: { method?: string; url?: string; body?: string; ct?: string }[] = [];
    const server = createHttpServerInt((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        seen.push({
          method: req.method,
          url: req.url,
          body,
          ct: (req.headers["content-type"] as string | undefined) ?? "",
        });
        if (req.url === "/graphql") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: { search: [{ id: "1", name: "X" }] } }));
        } else if (req.method === "GET" && req.url?.startsWith("/items")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('[{"id":"1","title":"first"}]');
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfoInt).port;
    const fixtureUrl = `http://127.0.0.1:${port}`;

    const dir = mkdtempSync(join(tmpdir(), "jig-plan4-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan4-int
  version: "0.0.1"
connections:
  rest_api:
    url: ${fixtureUrl}
    timeout_ms: 2000
  graph_api:
    url: ${fixtureUrl}/graphql
    timeout_ms: 2000
tools:
  - name: example
    description: x
    input:
      action: { type: string, required: true }
      term: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          list:
            handler:
              http:
                connection: rest_api
                method: GET
                path: "/items"
          search:
            handler:
              graphql:
                connection: graph_api
                query: "query Search($term: String!) { search(term: $term) { id name } }"
                variables:
                  term: "{{term}}"
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
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "example", arguments: { action: "list" } },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "example", arguments: { action: "search", term: "jig" } },
          },
        ],
      );
      const byId = new Map<number, (typeof responses)[number]>();
      for (const r of responses) byId.set(r.id as number, r);

      const list = byId.get(2)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(list.isError, undefined);
      assert.match(list.content[0]!.text, /"title":"first"/);

      const search = byId.get(3)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(search.isError, undefined);
      assert.match(search.content[0]!.text, /"name":"X"/);

      // Fixture saw a GET /items and a POST /graphql with the variables.
      const gqlCall = seen.find((s) => s.url === "/graphql")!;
      assert.equal(gqlCall.method, "POST");
      assert.match(gqlCall.ct!, /application\/json/);
      const gqlBody = JSON.parse(gqlCall.body!) as {
        query: string;
        variables: { term: string };
      };
      assert.equal(gqlBody.variables.term, "jig");
    } finally {
      rmSync(dir, { recursive: true });
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="http \\+ graphql round-trip"`
Expected: PASS.

### Task 7.4: Write the Plan 4 complete handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan4-complete.md` (actual Eastern time — `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Invoke the `building-in-the-open:curating-context` skill**

Follow the public-mode flow: Context Curator persona, four required sections (Where things stand / Decisions made / What's next / Landmines), under 2,000 tokens per bito.

Cover:

- **State:** Green, Plan 4 passing all tests plus four smoke recipes (`smoke`, `smoke-dispatch`, `smoke-compute`, `smoke-http`).
- **What changed:** All seven Plan 4 phases with commit references. The new surface: `${VAR}` shim, `connections:` block + compilation, network host allowlist (ADR-0010), fetch wrapper, http handler, graphql handler with error auto-detect. ADR-0011's sugar layer lives in one module.
- **What's next:** Plan 5 — probes. Early design call: where probes sit in the lifecycle (boot-time helper invocations returning cached values, vs. async-refresh track, vs. `{{probe.NAME}}` as a Mustache extension). Probes are consumers of the Plan 4 handlers at startup; the consumer shape is stable now.
- **Landmines:** likely candidates based on implementation —
  - Fetch wrapper's Abort signal treats timeouts as generic errors unless `signal.aborted` is checked — regression point if the signal state is consulted after the catch loses scope.
  - Handler `url:` without `connection:` has no connection headers and must declare its host explicitly via `server.security.network.allow` — the example shows the common case (connection) to avoid teaching the exception.
  - GraphQL always fetches in envelope mode internally and projects to data/envelope at the end. A refactor that switches the internal fetch to body mode loses access to status and headers on error paths.
  - The response-body JSON-parse in graphql assumes the response is JSON. Non-JSON GraphQL errors (upstream 502 HTML pages) produce a clear `graphql: response body is not JSON` message rather than cryptic parser errors.
  - Connection header rules evaluate against an empty context. An author who writes `{"var":"args.token"}` in a connection header gets `null` — handler fields are the place for args, not connection fields.
  - `compileConnections({})` returns `{}`, and every handler that references a connection name not in the map returns `isError` with a clear message. That's the intended behavior when the map is empty, but if a future refactor moves compilation behind a lazy path, the clear error could become "undefined is not a function."

### Task 7.5: Commit Phase 7

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): plan 4 example, smoke-http, handoff

Adds examples/http-and-graphql.yaml — a dispatch tool that exercises
http (list/show/create), graphql (search), inline (help), requires:
composition, and a tool-level transform envelope. Declares two
connections with ${VAR} env interpolation and relies on the inferred
network allowlist from connection URLs (ADR-0010).

Adds `just smoke-http` — initialize + the help action, verifying
config parses cleanly and dispatch + transform compose through the
new handler types. Real round-trips are exercised by the Plan 4
integration test against an http.createServer() fixture.

Adds an integration test that round-trips http (GET /items) and
graphql (search with variables) over stdio, verifying connection
URL composition, variable rendering, and envelope parsing for both
handlers.

Lands the Plan 4 complete handoff under .handoffs/, naming Plan 5
(probes) as the next plan.

Plan 4 is complete with this commit: connections: block with ${VAR}
shim per ADR-0011, network host confinement per ADR-0010, http and
graphql handlers against Node 22+ fetch, no new runtime deps.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Self-Review Checklist (run this once, at drafting time)

- [x] **Spec coverage.** Every section of the Plan 4 design doc maps to a phase:
      schema additions → Phase 2; http handler → Phase 5; graphql handler → Phase 6;
      response shape → Phases 4-6 (envelope mode in fetch wrapper and per-handler);
      value resolution → Phases 1, 2, 5, 6; resolution timing → Phase 2 + Phase 5 (per-request resolveHeaders);
      access control → Phase 3 (ADR-0010); boot sequence → Phase 3 (sanity check), Phase 5 (handler wiring);
      file layout → matches Phase 1-6 `Files:` sections exactly.
- [x] **Placeholder scan.** No TBD/TODO/implement-later/similar-to. Every step has complete code.
- [x] **Type consistency.** `HttpHandler`, `GraphqlHandler`, `ConnectionDefinition`, `CompiledConnection`, `InvokeContext`, `FetchRequest` all have the same shape across Phases 2-6. `invoke()` signature grows `ctx: InvokeContext` in Phase 5 and stays consistent through Phase 6.
- [x] **Gate completeness.** Phases 1-6 gate on five recipes (check, test, smoke, smoke-dispatch, smoke-compute). Phase 7 adds smoke-http as the sixth.
- [x] **Branch naming.** Eight branches, one per phase, following `feat/plan4-<topic>` convention.
- [x] **No SDK leakage.** No imports from `@modelcontextprotocol/*` in util/, handlers/, or connections.ts. Runtime wiring in src/runtime/index.ts stays the only place the SDK surface meets handler code.
- [x] **Test fixtures.** All network tests spin up `http.createServer()` fixtures on ephemeral ports — no external network calls, deterministic CI.
- [x] **Landmine hints in handoff.** Phase 7 Task 7.4 lists candidate landmines drawn from implementation choices (envelope internal fetch, empty-context header eval, non-JSON graphql bodies, etc.).

---
