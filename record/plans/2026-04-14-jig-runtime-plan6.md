# jig Runtime — Plan 6 (resources + watchers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add a top-level optional `resources:` block of MCP resources — boot-registered, content-bearing endpoints addressable via `resources/list` + `resources/read`, with optional `watcher:` subspecs that emit `notifications/resources/updated` to subscribed clients when underlying data changes. Two watcher types ship in v1: `polling` (interval + hash-based change detection) and `file` (`fs.watch` on a path). Subscribe/unsubscribe handlers are wired via the low-level `server.server.setRequestHandler` surface the SDK's `McpServer` omits.

**Architecture:** Six phases land in order. (0) The plan doc itself. (1) `src/runtime/resources.ts` adds `validateResources` (schema, URI uniqueness, unknown-key rejection, polling/file watcher shape) plus `ResourceSpec`/`WatcherSpec`/`ResourcesConfig` in `src/runtime/config.ts`. (2) The same file gains `registerResources(serverHandle, resources, ctx)` — iterates the array, calls `server.registerResource` per entry, installs a read callback that runs `invoke(handler, {}, ctx)` and translates `ToolCallResult.content[0].text` into the SDK's `ReadResourceResult`. (3) `src/runtime/server.ts` gains `trackSubscriptions()` — reaches into `server.server`, registers `resources/subscribe` + `/unsubscribe` handlers, declares `capabilities.resources.subscribe: true`, returns a `SubscriptionTracker { isSubscribed(uri) }`. `resources.ts` gains `startWatchers(resources, serverHandle, tracker, ctx)` with polling-watcher-only in Phase 3. (4) `startWatchers` learns the file-watcher branch via `fs.watch`; path goes through `isPathAllowed`. (5) An example + `smoke-resource` recipe + integration test cover the full round-trip: initialize → resources/list → resources/read → subscribe → observe a polling-driven update → unsubscribe.

**Tech Stack:** No new production dependencies — reuses Plan 4's connection compilation, Plan 4's handler invocation chain, Plan 5's `InvokeContext.probe`, and the Node built-ins `crypto.createHash` (for the polling watcher's content hash) and `fs.watch` (for the file watcher). TypeScript 6.0+, `node:test`, `yaml`, `@modelcontextprotocol/server@2.0.0-alpha.2` all unchanged.

---

## Scope Note

This is **plan 6 of ~8** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)) and the [Plan 6 design doc](../designs/2026-04-14-plan6-resources-watchers.md).

**Planned sequence (updated from Plan 5's "~7" after splitting what was "Plan 6 = everything-MCP-that-isn't-tools"):**

1. Plan 1 — smoke test (merged) — stdio MCP + inline tool
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. Plan 4 — connections + http + graphql (merged)
5. Plan 5 — probes (merged)
6. **Plan 6 — resources + watchers** (this plan)
7. Plan 7 — prompts + completions (includes URI templates + template variable completion)
8. Plan 8 — tasks + state machines (MCP task lifecycle, elicitation, idempotency)
9. Plan 9 — CLI (`jig new|dev|validate|build`) + build pipeline

**Out of scope for Plan 6 (carried to later plans):**

- **URI templates** and `resources/templates/list`. The SDK supports them, but template variable completion belongs to Plan 7's `completions:` surface. Shipping templates without completion produces an awkward intermediate state.
- **Blob content.** `ReadResourceResult.contents[].blob` (base64). Handlers return text; blob translation needs a design decision about where encoding happens. Deferred until a real user asks.
- **Webhook watchers.** Requires jig to listen on an HTTP port. Current transport is stdio-only; adding inbound HTTP alongside stdio is architecturally heavy for v1. Schema is forward-compatible via union extension.
- **Glob paths for file watcher.** Single-path `fs.watch` only. A future plan adds chokidar-style glob support.
- **Graceful shutdown.** `startWatchers` returns disposers that v1 collects but never invokes; process exit handles cleanup. A future SIGTERM plan consumes them.
- **Mid-session resource add/remove.** `sendResourceListChanged` fires once per resource at boot (via the SDK's auto-wire). A future YAML hot-reload plan adds runtime registration.
- **Multi-client subscription state.** Stdio = single client; `Set<string>` of subscribed URIs. HTTP transport with sessions (Plan 9+) needs a per-session tracker.
- **`completion/complete` for resource URIs.** Plan 7.
- **Start/stop watcher lifecycle on subscribe/unsubscribe.** v1 runs watchers unconditionally; the subscription check gates emit, not watcher lifecycle. See Plan 6 design doc *Alternatives considered*.

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **SDK quarantine holds.** Direct imports of `@modelcontextprotocol/server` stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. `src/runtime/resources.ts` imports types + helpers from `./server.ts`, not from the SDK package. Phase 3's subscribe/unsubscribe wiring uses `server.server.setRequestHandler`, which crosses the SDK surface — that crossing lives in `server.ts`.
- **`resources:` is optional.** A config without a `resources:` block parses, validates, and boots exactly as before Plan 6. Every test for absent-resources behavior must still pass.
- **Watchers do not crash the server.** A handler failure (`isError: true`), an exception, or an `fs.watch` error logs to stderr and skips the emit. The process must survive transient upstream / filesystem errors across an open session.
- **Watcher paths honor the filesystem allowlist.** `file:` watcher `path` goes through `isPathAllowed` from `src/runtime/util/access.ts`. A path outside the allowlist fails at boot with a multi-line stderr block (same shape as probe failures).
- **Subscription emit gate.** Polling and file watchers both compute whether to emit but only call `sendResourceUpdated` when `tracker.isSubscribed(uri) === true`. An unsubscribed URI generates no notification traffic.
- **No new runtime deps.** Node 24+ built-ins + existing deps (`@modelcontextprotocol/server`, `@cfworker/json-schema`, `json-logic-engine`, `yaml`).
- **Eight gates must all pass before commit** (the existing seven from Plan 5 plus a new `just smoke-resource` in Phase 5): `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`. Phase 5 adds `just smoke-resource` as the eighth gate.
- **Commits via `commit.txt`.** Every commit step writes the message to `commit.txt`; Clay runs `gtxt` (`git commit -F commit.txt && rm commit.txt`) and `git pm` (push + PR + auto-merge). Never `git commit` directly.
- **Specific-path `git add`** — never `-A`. Plugin hooks drop files in `.config/` mid-session; specific paths keep scope clean.
- **Feature branch per phase.** `feat/plan6-doc`, `feat/plan6-types`, `feat/plan6-registration`, `feat/plan6-polling`, `feat/plan6-file`, `feat/plan6-complete`. Each phase lands on main before the next starts.
- **Integration tests carry `{ timeout: 15_000 }`.** Subprocess-based tests hang forever on bugs without it.
- **`.handoffs/` timestamp in Eastern Time.** Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before creating the handoff file (hook-enforced at commit time).

## File Structure

```
jig/
  record/
    plans/
      2026-04-14-jig-runtime-plan6.md                  # this plan (Phase 0)
    designs/
      2026-04-14-plan6-resources-watchers.md           # the spec (landed separately)
  src/
    runtime/
      resources.ts                                     # NEW — validateResources + registerResources + startWatchers (Phases 1, 2, 3, 4)
      config.ts                                        # + ResourceSpec, WatcherSpec, ResourcesConfig types; validator wiring (Phase 1)
      server.ts                                        # + registerResource adapter method; + trackSubscriptions() (Phases 2, 3)
      index.ts                                         # + boot orchestration for registerResources + startWatchers + trackSubscriptions (Phases 2, 3)
  tests/
    resources.test.ts                                  # NEW — validator + registration + watcher unit tests (Phases 1, 2, 3, 4)
    config.test.ts                                     # + resources parsing tests (Phase 1)
    integration.test.ts                                # + resources round-trip over stdio (Phase 5)
  examples/
    resources.yaml                                     # NEW (Phase 5)
  justfile                                             # + smoke-resource recipe (Phase 5)
  .handoffs/
    YYYY-MM-DD-HHMM-jig-runtime-plan6-complete.md      # NEW (Phase 5)
```

**Not in Plan 6:** `src/runtime/prompts.ts`, `completions.ts`, `tasks.ts`, `transports/http.ts`, `src/cli/`. Those arrive in Plans 7, 8, 9.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 6 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `feat/plan6-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 6 (resources + watchers)

Phase 0 of jig runtime Plan 6 — the plan doc itself. Subsequent
phases land on feat/plan6-types, feat/plan6-registration,
feat/plan6-polling, feat/plan6-file, feat/plan6-complete.

Plan 6 delivers: resources: top-level block of MCP resources;
static URI registration; resources/list + resources/read via the
SDK's auto-wired handlers; subscribe/unsubscribe via
server.server.setRequestHandler (the SDK's high-level class
omits them); two watcher types — polling (interval + hash-based
change detection) and file (fs.watch); notifications/
resources/updated emitted only to subscribed URIs; handler reuse
(same types as tools) with empty args and the InvokeContext
from Plan 5.

Out of scope per the scope note: URI templates, blob content,
webhook watchers, glob paths, graceful shutdown, mid-session
resource add/remove, multi-client subscription state,
resources/templates/list, completion/complete.
```

- [ ] **Step 2: Stage with specific path and commit**

Stage: `git add record/plans/2026-04-14-jig-runtime-plan6.md`

Clay: `gtxt && git pm`

Expected: Plan 6 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: `ResourceSpec` types + `validateResources`

**Intent:** Land the schema. After this phase, `parseConfig()` on a YAML with a `resources:` block returns a typed `JigConfig.resources: ResourcesConfig | undefined` with all validation rules from the design doc enforced — URI parse check, unique URI, required `name`, `handler` delegated to `validateHandler`, watcher-shape union, unknown-key rejection. No runtime behavior changes — the `resources` field is parsed and forgotten (no registration yet).

**Branch:** `feat/plan6-types`

### Task 1.1: Add `WatcherSpec` + `ResourceSpec` + `ResourcesConfig` types

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the types**

After `ProbesConfig` (search for `export type ProbesConfig`):

```typescript
/**
 * Watcher types supported in v1. Polling re-invokes the handler on an
 * interval and compares content hashes; file uses fs.watch on a single
 * filesystem path. Webhook and glob paths are deferred — see Plan 6
 * design doc, "Out of scope".
 */
export type WatcherSpec =
  | {
      type: "polling";
      interval_ms: number;
      change_detection?: "hash" | "always";
    }
  | {
      type: "file";
      path: string;
    };

/**
 * A single declared resource. URI is the addressable identity (static —
 * no templates in v1). Handler reuses the existing tool handler types;
 * the resource read callback invokes it with empty args and translates
 * the ToolCallResult's first text content into a ReadResourceResult.
 * Watcher is optional; when absent, the resource is read-only.
 */
export interface ResourceSpec {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: Handler;
  watcher?: WatcherSpec;
}

export type ResourcesConfig = ResourceSpec[];
```

- [ ] **Step 2: Extend `JigConfig` with the optional field**

Find `export interface JigConfig {` and add the field alongside `probes?:`:

```typescript
  /** MCP resources — boot-registered content endpoints. */
  resources?: ResourcesConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — types compile without consumers.

### Task 1.2: Write the first failing test — accept a minimal resource

**Files:**
- Create: `tests/resources.test.ts`

- [ ] **Step 1: Write the test file scaffold**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a resources: block with a single static-uri resource", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    description: A greeting
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.resources, "resources must be present");
  assert.equal(cfg.resources.length, 1);
  const r = cfg.resources[0]!;
  assert.equal(r.uri, "config://jig/hello");
  assert.equal(r.name, "Hello");
  assert.equal(r.mimeType, "text/plain");
  assert.ok("inline" in r.handler);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="config accepts a resources: block"`
Expected: FAIL — `parseConfig` does not yet wire the `resources:` block; `cfg.resources` is undefined.

### Task 1.3: Write more failing tests — the full validator contract

**Files:**
- Modify: `tests/resources.test.ts`

- [ ] **Step 1: Append the remaining validator tests**

Append after the Task 1.2 test:

```typescript
test("config accepts resources with polling and file watchers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: queue://jobs
    name: Jobs
    handler: { inline: { text: "[]" } }
    watcher:
      type: polling
      interval_ms: 5000
  - uri: file:///tmp/state.json
    name: State
    handler: { exec: "cat /tmp/state.json" }
    watcher:
      type: file
      path: /tmp/state.json
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.resources!.length, 2);
  assert.deepEqual(cfg.resources![0]!.watcher, {
    type: "polling",
    interval_ms: 5000,
  });
  assert.deepEqual(cfg.resources![1]!.watcher, {
    type: "file",
    path: "/tmp/state.json",
  });
});

test("config rejects resources that isn't an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  not_an_array: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources must be an array/);
});

test("config rejects a resource missing uri", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - name: Missing URI
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]\.uri is required/);
});

test("config rejects a resource with an invalid uri", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: "not a uri because spaces"
    name: Bad
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]\.uri .* valid URL/);
});

test("config rejects duplicate resource URIs", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://dup
    name: A
    handler: { inline: { text: a } }
  - uri: config://dup
    name: B
    handler: { inline: { text: b } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /duplicate uri "config:\/\/dup"/);
});

test("config rejects a resource with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    bogus: 42
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]: unknown key "bogus"/);
});

test("config rejects a polling watcher missing interval_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /polling watcher .* interval_ms/);
});

test("config rejects a polling watcher with a non-positive interval_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 0
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /interval_ms .* positive number/);
});

test("config rejects a polling watcher with bad change_detection", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 5000
      change_detection: maybe
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /change_detection .* "hash" or "always"/);
});

test("config rejects a file watcher missing path", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: file
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /file watcher .* path/);
});

test("config rejects an unknown watcher type", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: webhook
      url: https://example.com
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /watcher\.type must be one of polling, file/);
});

test("config rejects a watcher with an unknown key for its type", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 5000
      path: /tmp/x
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /polling watcher: unknown key "path"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="resources"`
Expected: all new tests FAIL — `parseConfig` ignores the `resources:` block.

### Task 1.4: Scaffold `src/runtime/resources.ts` with `validateResources`

**Files:**
- Create: `src/runtime/resources.ts`
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Create `src/runtime/resources.ts` with the validator**

```typescript
import type { ResourceSpec, ResourcesConfig, WatcherSpec, Handler } from "./config.ts";

/**
 * Validate the top-level `resources:` block.
 *
 * Rules:
 *   - resources is undefined OR an array (rejects mapping, scalar, null)
 *   - each entry has required uri (parseable as URL) + name (non-empty)
 *     + handler (delegated to validateHandler via the caller)
 *   - uris are unique across the block
 *   - watcher: optional; when present, union of polling { interval_ms,
 *     change_detection? } | file { path }
 *   - unknown keys at entry and watcher level are rejected
 *
 * The `validateHandler` callback is injected so this module doesn't pull
 * config.ts's private handler validator.
 */
export function validateResources(
  v: unknown,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): ResourcesConfig | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new Error("config: resources must be an array");
  }
  const out: ResourcesConfig = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validateResourceEntry(v[i], i, validateHandler, seen));
  }
  return out;
}

const ENTRY_KNOWN = new Set([
  "uri", "name", "description", "mimeType", "handler", "watcher",
]);

function validateResourceEntry(
  entry: unknown,
  index: number,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
  seen: Set<string>,
): ResourceSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: resources[${index}] must be a mapping`);
  }
  const e = entry as Record<string, unknown>;
  for (const key of Object.keys(e)) {
    if (!ENTRY_KNOWN.has(key)) {
      throw new Error(`config: resources[${index}]: unknown key "${key}"`);
    }
  }
  if (typeof e["uri"] !== "string" || e["uri"].length === 0) {
    throw new Error(`config: resources[${index}].uri is required and must be a non-empty string`);
  }
  const uri = e["uri"];
  try {
    new URL(uri);
  } catch {
    throw new Error(`config: resources[${index}].uri "${uri}" is not a valid URL`);
  }
  if (seen.has(uri)) {
    throw new Error(`config: resources: duplicate uri "${uri}"`);
  }
  seen.add(uri);

  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: resources[${index}].name is required and must be a non-empty string`);
  }

  if (e["description"] !== undefined && typeof e["description"] !== "string") {
    throw new Error(`config: resources[${index}].description must be a string`);
  }
  if (e["mimeType"] !== undefined && typeof e["mimeType"] !== "string") {
    throw new Error(`config: resources[${index}].mimeType must be a string`);
  }

  if (!e["handler"] || typeof e["handler"] !== "object") {
    throw new Error(`config: resources[${index}].handler is required and must be a mapping`);
  }
  const handler = validateHandler(e["handler"], `resources[${index}]`);

  const out: ResourceSpec = {
    uri,
    name: e["name"],
    handler,
  };
  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (e["mimeType"] !== undefined) out.mimeType = e["mimeType"] as string;

  if (e["watcher"] !== undefined) {
    out.watcher = validateWatcher(e["watcher"], index);
  }

  return out;
}

const POLLING_KNOWN = new Set(["type", "interval_ms", "change_detection"]);
const FILE_KNOWN = new Set(["type", "path"]);

function validateWatcher(v: unknown, resourceIndex: number): WatcherSpec {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: resources[${resourceIndex}].watcher must be a mapping`);
  }
  const w = v as Record<string, unknown>;
  const type = w["type"];
  if (type !== "polling" && type !== "file") {
    throw new Error(
      `config: resources[${resourceIndex}].watcher.type must be one of polling, file`,
    );
  }

  if (type === "polling") {
    for (const key of Object.keys(w)) {
      if (!POLLING_KNOWN.has(key)) {
        throw new Error(`config: resources[${resourceIndex}].watcher polling watcher: unknown key "${key}"`);
      }
    }
    const interval = w["interval_ms"];
    if (interval === undefined) {
      throw new Error(`config: resources[${resourceIndex}].watcher polling watcher requires interval_ms`);
    }
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher.interval_ms must be a positive number`);
    }
    const cd = w["change_detection"];
    if (cd !== undefined && cd !== "hash" && cd !== "always") {
      throw new Error(`config: resources[${resourceIndex}].watcher.change_detection must be "hash" or "always"`);
    }
    const out: WatcherSpec = { type: "polling", interval_ms: interval };
    if (cd !== undefined) out.change_detection = cd as "hash" | "always";
    return out;
  }

  // type === "file"
  for (const key of Object.keys(w)) {
    if (!FILE_KNOWN.has(key)) {
      throw new Error(`config: resources[${resourceIndex}].watcher file watcher: unknown key "${key}"`);
    }
  }
  const path = w["path"];
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`config: resources[${resourceIndex}].watcher file watcher requires path (non-empty string)`);
  }
  return { type: "file", path };
}
```

- [ ] **Step 2: Wire `validateResources` into `parseConfig`**

In `src/runtime/config.ts`, add the import near the other runtime imports at the top of the file:

```typescript
import { validateResources } from "./resources.ts";
```

Find `parseConfig` (search for `export function parseConfig`) and extend it. The current body:

```typescript
const probes = validateProbes(obj["probes"]);

const result: JigConfig = { server, tools };
if (connections !== undefined) result.connections = connections;
if (probes !== undefined) result.probes = probes;
return result;
```

becomes:

```typescript
const probes = validateProbes(obj["probes"]);
const resources = validateResources(obj["resources"], (h, owner) =>
  validateHandlerPublic(h, owner),
);

const result: JigConfig = { server, tools };
if (connections !== undefined) result.connections = connections;
if (probes !== undefined) result.probes = probes;
if (resources !== undefined) result.resources = resources;
return result;
```

Below `validateHandler` (still a private function), expose a named wrapper so `resources.ts` can delegate handler validation without pulling a private binding:

```typescript
/**
 * Public wrapper over validateHandler so sibling modules (resources.ts)
 * can delegate handler validation under their own owner labels
 * ("resources[0]" etc.) without duplicating the handler-type dispatch.
 */
export function validateHandlerPublic(h: unknown, ownerLabel: string): Handler {
  return validateHandler(h, ownerLabel);
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- --test-name-pattern="resources"`
Expected: all 12 Phase-1 tests PASS.

Run: `npm run check`
Expected: PASS.

### Task 1.5: Run the full gate suite and commit

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): resources: schema + validator (no registration yet)

Phase 1 of Plan 6 — Resources + Watchers. Lands the top-level
optional resources: block as a typed JigConfig.resources:
ResourcesConfig | undefined, fully validated at parseConfig time.

Schema:
  - resources is undefined OR an array
  - per-entry: uri (required non-empty string parseable as URL,
    unique across block), name (required non-empty string),
    description (optional string), mimeType (optional string),
    handler (required; reuses validateHandler from config.ts),
    watcher (optional: polling | file union)
  - polling watcher: interval_ms required positive number,
    change_detection optional "hash" | "always" (default "hash"
    applied at invocation, not parse)
  - file watcher: path required non-empty string
  - unknown keys rejected at entry and watcher level

No runtime behavior changes yet — resources: is parsed and
forgotten. Boot registration lands in Phase 2; watchers in
Phase 3 and Phase 4.
```

- [ ] **Step 3: Stage with specific paths**

Stage:
```bash
git add \
  src/runtime/resources.ts \
  src/runtime/config.ts \
  tests/resources.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 1 merges to main.

---

## Phase 2: Static resource registration + `resources/list` + `resources/read`

**Intent:** After this phase, a config with a `resources:` block exposes every resource over stdio: `resources/list` returns the registered URIs, `resources/read` invokes the handler and returns the text. Handler `isError: true` surfaces as a JSON-RPC error. No watchers yet; no subscribe/unsubscribe yet.

**Branch:** `feat/plan6-registration`

### Task 2.1: Extend `JigServerHandle` with a `registerResource` adapter method

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Add the imports and types**

Near the top imports of `server.ts`, extend the SDK import list to include the resource types:

```typescript
import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
  type JsonSchemaType,
  type ReadResourceCallback,
  type ReadResourceResult,
  type RegisteredResource,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
```

Right below `RegisterToolSpec` (search for `export interface RegisterToolSpec`), add:

```typescript
/**
 * Minimal spec a caller passes into registerResource. Mirrors the shape
 * of SDK's ResourceMetadata sans uri/name (which travel separately).
 */
export interface RegisterResourceSpec {
  name: string;
  description?: string;
  mimeType?: string;
}

/** Handler signature for a resource read. */
export type ResourceHandler = (uri: URL) => Promise<ReadResourceResult>;
```

- [ ] **Step 2: Extend `JigServerHandle`**

Find `export interface JigServerHandle {` and add a new method alongside `registerTool`:

```typescript
  /**
   * Register one resource at a static URI. The adapter forwards to
   * McpServer.registerResource, which auto-wires resources/list,
   * resources/templates/list, and resources/read request handlers on
   * first call and sets capabilities.resources.listChanged.
   */
  registerResource(
    uri: string,
    spec: RegisterResourceSpec,
    handler: ResourceHandler,
  ): RegisteredResource;
```

- [ ] **Step 3: Implement `registerResource` in `createServer`'s returned object**

Inside the returned object literal (right after `registerTool`), add:

```typescript
    registerResource(uri, spec, handler) {
      const metadata: ResourceMetadata = {};
      if (spec.description !== undefined) metadata.description = spec.description;
      if (spec.mimeType !== undefined) metadata.mimeType = spec.mimeType;
      // SDK signature: registerResource(name, uriOrTemplate: string, config, readCallback)
      const readCallback: ReadResourceCallback = async (u) => handler(u);
      return server.registerResource(spec.name, uri, metadata, readCallback);
    },
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS — no unused imports, no type errors.

### Task 2.2: Write a failing integration test for `resources/list`

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append a new integration test**

Near the bottom of `tests/integration.test.ts`, append:

```typescript
test("resources/list returns registered resources", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-list-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-list, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    description: Greeting
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "resources/list response present");
    const result = listResp.result as { resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> };
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0]!.uri, "config://jig/hello");
    assert.equal(result.resources[0]!.name, "Hello");
    assert.equal(result.resources[0]!.description, "Greeting");
    assert.equal(result.resources[0]!.mimeType, "text/plain");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="resources/list returns"`
Expected: FAIL — the runtime doesn't register resources yet. The response either lacks `result.resources` or returns a MethodNotFound error.

### Task 2.3: Implement `registerResources` in `src/runtime/resources.ts`

**Files:**
- Modify: `src/runtime/resources.ts`
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Add the boot-time registration helper to `resources.ts`**

Two edits:

**(a)** Add these imports to the TOP of `src/runtime/resources.ts` alongside the Phase 1 imports:

```typescript
import type { JigServerHandle, RegisteredResourceHandle } from "./server.ts";
import { invoke, type InvokeContext } from "./handlers/index.ts";
```

**(b)** Append the rest (export + function body) to the bottom of the file:

```typescript
/**
 * Handle type alias for the return value of registerResource. Named so
 * the future graceful-shutdown plan can collect these per resource.
 */
export type { RegisteredResourceHandle };

/**
 * Register every resource in the config with the MCP server. Returns an
 * array of SDK handles for future reload/shutdown consumers; v1 ignores
 * the return value.
 *
 * Each resource's read callback invokes the configured handler with
 * empty args and the boot InvokeContext (connections + probe). The
 * handler's ToolCallResult is translated into a ReadResourceResult:
 *   - content[0].text becomes contents[0].text
 *   - mimeType carries through from the resource spec
 *   - isError: true becomes a thrown Error — the SDK surfaces it as a
 *     JSON-RPC error response
 */
export function registerResources(
  server: JigServerHandle,
  resources: ResourcesConfig,
  ctx: InvokeContext,
): RegisteredResourceHandle[] {
  const handles: RegisteredResourceHandle[] = [];
  for (const spec of resources) {
    const handle = server.registerResource(
      spec.uri,
      {
        name: spec.name,
        ...(spec.description !== undefined && { description: spec.description }),
        ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
      },
      async (uri) => {
        const raw = await invoke(spec.handler, {}, ctx);
        if (raw.isError) {
          const msg = raw.content[0]?.text ?? "<handler returned isError with no text>";
          throw new Error(`resource "${uri.toString()}" read failed: ${msg}`);
        }
        return {
          contents: [
            {
              uri: uri.toString(),
              ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
              text: raw.content[0]?.text ?? "",
            },
          ],
        };
      },
    );
    handles.push(handle);
  }
  return handles;
}
```

- [ ] **Step 2: Expose `RegisteredResourceHandle` from `server.ts`**

Near the `JigServerHandle` interface declaration in `server.ts`, add a type re-export so `resources.ts` doesn't import directly from the SDK package:

```typescript
/** Re-export of SDK's RegisteredResource so sibling modules stay off the SDK. */
export type RegisteredResourceHandle = RegisteredResource;
```

- [ ] **Step 3: Wire `registerResources` into `src/runtime/index.ts`**

In `src/runtime/index.ts`, import the new helper (add to existing imports):

```typescript
import { registerResources } from "./resources.ts";
```

After the existing tool-registration `for` loop and before `await server.connect(...)`:

```typescript
  if (config.resources) {
    registerResources(server, config.resources, ctx);
  }

  await server.connect(createStdioTransport());
```

- [ ] **Step 4: Run the Phase 2 integration test**

Run: `npm test -- --test-name-pattern="resources/list returns"`
Expected: PASS.

### Task 2.4: Write a failing integration test for `resources/read`

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the read test**

```typescript
test("resources/read returns the handler's text content", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-read-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-read, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "config://jig/hello" } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    const result = readResp.result as { contents: Array<{ uri: string; mimeType?: string; text: string }> };
    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0]!.uri, "config://jig/hello");
    assert.equal(result.contents[0]!.mimeType, "text/plain");
    assert.equal(result.contents[0]!.text, "hello, world");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resources/read surfaces isError handlers as a JSON-RPC error", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-read-err-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-read-err, version: "0.0.1" }
resources:
  - uri: config://jig/broken
    name: Broken
    handler:
      exec: "sh -c 'echo oops >&2; exit 2'"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "config://jig/broken" } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    assert.ok(readResp.error, "read of an isError handler must return a JSON-RPC error");
    assert.match(readResp.error!.message, /read failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- --test-name-pattern="resources/read"`
Expected: both tests PASS (the happy path passes because Phase 2 Step 3 already wired the translation; the error-path test passes because `registerResources` throws on `isError: true` and the SDK turns thrown errors into JSON-RPC errors).

### Task 2.5: Run the full gate suite and commit

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): resources: registration + resources/list + resources/read

Phase 2 of Plan 6. Lands the static-resource registration path:
configs declaring a resources: block expose every resource over
stdio via the SDK's auto-wired resources/list, resources/
templates/list (empty for v1), and resources/read request
handlers.

Changes:
  - server.ts: JigServerHandle gains registerResource(uri, spec,
    handler); RegisteredResourceHandle re-exported so
    resources.ts stays off the SDK package
  - resources.ts: registerResources(server, resources, ctx)
    iterates the array, installs a read callback per resource
    that invokes the handler with empty args and translates the
    ToolCallResult.content[0].text into a ReadResourceResult
  - index.ts: boot-time call to registerResources after tool
    registration, before server.connect
  - Handler isError: true thrown from the read callback; SDK
    surfaces it as a JSON-RPC error response with the handler's
    error text

No subscribe/unsubscribe yet; no watchers; no update
notifications. Phase 3 adds the subscription surface and the
polling watcher.
```

- [ ] **Step 3: Stage with specific paths**

Stage:
```bash
git add \
  src/runtime/resources.ts \
  src/runtime/server.ts \
  src/runtime/index.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 3: Subscribe/unsubscribe tracking + polling watcher

**Intent:** Wire the subscribe/unsubscribe request handlers the SDK's high-level class omits, declare `capabilities.resources.subscribe: true`, and ship the polling watcher. After this phase, a resource with `watcher: { type: polling, interval_ms: N }` emits `notifications/resources/updated` to the client when its content changes — but only if the client has subscribed to the URI.

**Branch:** `feat/plan6-polling`

### Task 3.1: Add `trackSubscriptions` to `JigServerHandle`

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: No new imports needed for the subscribe wiring**

The SDK's low-level `Protocol.setRequestHandler` takes a method **string** (constrained to `RequestMethod`), not a Zod schema. Request shape is typed automatically via `RequestTypeMap[M]` — see `node_modules/@modelcontextprotocol/server/dist/index-Bhfkexnj.d.mts:9493`:

```typescript
setRequestHandler<M extends RequestMethod>(
  method: M,
  handler: (request: RequestTypeMap[M], ctx: ContextT) => Result$1 | Promise<Result$1>,
): void;
```

So Phase 3 adds NO new SDK imports. The existing import list in `server.ts` from Phase 2 already covers what we need (the new `trackSubscriptions` implementation uses only `server.server.registerCapabilities`, `server.server.setRequestHandler`, and `server.server.sendResourceUpdated` — all via the existing `server` reference in the closure).

- [ ] **Step 2: Add the SubscriptionTracker interface**

After `RegisterResourceSpec`:

```typescript
/**
 * Per-process subscription state. Single-client stdio transport =
 * one Set<uri>. A future multi-client HTTP transport swaps this for a
 * per-session Map.
 */
export interface SubscriptionTracker {
  isSubscribed(uri: string): boolean;
}
```

- [ ] **Step 3: Extend `JigServerHandle`**

Add to the interface:

```typescript
  /**
   * Wire resources/subscribe + resources/unsubscribe request handlers
   * on the underlying Server (McpServer's high-level class omits them)
   * and declare capabilities.resources.subscribe: true. Returns a
   * tracker so watchers can gate emit on subscription state.
   *
   * MUST be called before server.connect(). Call order: registerResource
   * for all resources, then trackSubscriptions, then connect.
   */
  trackSubscriptions(): SubscriptionTracker;
```

- [ ] **Step 4: Implement `trackSubscriptions`**

Inside the object returned by `createServer`, add after `registerResource`:

```typescript
    trackSubscriptions() {
      const subscribed = new Set<string>();
      // Reach into the low-level Server. The SDK's McpServer class
      // exposes its underlying Server via the `server` property
      // (dist/index.d.mts:502). Subscribe/unsubscribe are not wired by
      // the high-level class, so we register them ourselves. The
      // generic on setRequestHandler infers request shape from the
      // method literal (RequestTypeMap["resources/subscribe"] etc.).
      const lowLevel = server.server;
      lowLevel.registerCapabilities({ resources: { subscribe: true } });
      lowLevel.setRequestHandler("resources/subscribe", async (req) => {
        subscribed.add(req.params.uri);
        return {};
      });
      lowLevel.setRequestHandler("resources/unsubscribe", async (req) => {
        subscribed.delete(req.params.uri);
        return {};
      });
      return {
        isSubscribed(uri: string) {
          return subscribed.has(uri);
        },
      };
    },
```

- [ ] **Step 5: Add `sendResourceUpdated` wrapper**

The watcher needs a way to emit the update notification. Add to `JigServerHandle`:

```typescript
  /**
   * Fire notifications/resources/updated for a URI. Watchers call this
   * unconditionally — the subscription gate lives at the watcher layer
   * (startWatchers), so callers only reach this path when
   * tracker.isSubscribed(uri) === true.
   */
  sendResourceUpdated(uri: string): Promise<void>;
```

And implement inside the returned object:

```typescript
    async sendResourceUpdated(uri) {
      await server.server.sendResourceUpdated({ uri });
    },
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: PASS.

### Task 3.2: Write a failing integration test for subscribe + polling update

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the subscribe + update test**

```typescript
test("polling watcher emits resources/updated when content changes and client is subscribed", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-poll-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-poll, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 200
tools: []
`);
  try {
    // Custom RPC loop: initialize, subscribe, then mutate the file
    // after the first interval, expect an updated notification before
    // the process exits.
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    child.stdout.setEncoding("utf8");
    let buf = "";
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/subscribe", params: { uri: "config://jig/state" } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // Wait one polling interval so the hash-baseline is captured, then mutate.
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(statePath, "two");

    // Give the watcher up to 2 more intervals to fire.
    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 2_000);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.ok(updated, "expected a resources/updated notification");
    const parsed = JSON.parse(updated!) as { method: string; params: { uri: string } };
    assert.equal(parsed.method, "notifications/resources/updated");
    assert.equal(parsed.params.uri, "config://jig/state");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function waitForLine(lines: string[], pred: (l: string) => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (lines.some(pred)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for line matching predicate. Got:\n${lines.join("\n")}`);
}
```

If `spawn` or `waitForLine` is already imported / defined in `integration.test.ts` from a previous phase, skip the redeclaration and reuse the existing definitions. Use `import { spawn } from "node:child_process";` at the top of the file if not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="polling watcher emits"`
Expected: FAIL — no watcher yet. The test times out waiting for the notification.

### Task 3.3: Implement `startWatchers` with polling

**Files:**
- Modify: `src/runtime/resources.ts`
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Add the polling watcher**

Two edits:

**(a)** Add these to the TOP of `src/runtime/resources.ts` alongside the existing imports:

```typescript
import { createHash } from "node:crypto";
import type { SubscriptionTracker } from "./server.ts";
```

(`JigServerHandle` was imported in Phase 2 Step 1.)

**(b)** Append the types + functions to the bottom of the file:

```typescript

/**
 * Disposer returned per watcher. v1 collects these but never invokes;
 * process exit cleans up setInterval / fs.watch handles.
 */
export type WatcherDisposer = () => void;

/**
 * Start every watcher declared in the config. Polling watchers
 * re-invoke the handler on an interval and hash the result; file
 * watchers (Phase 4) subscribe to fs.watch events on a path. Both
 * emit resources/updated only when the URI is subscribed.
 *
 * Watcher failures log to stderr and skip the emit; the server does not
 * crash. A handler whose upstream is transiently flaking must not take
 * down an otherwise-running session.
 */
export function startWatchers(
  resources: ResourcesConfig,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
  ctx: InvokeContext,
): WatcherDisposer[] {
  const disposers: WatcherDisposer[] = [];
  for (const spec of resources) {
    if (!spec.watcher) continue;
    if (spec.watcher.type === "polling") {
      disposers.push(startPollingWatcher(spec, spec.watcher, server, tracker, ctx));
    }
    // file watcher lands in Phase 4
  }
  return disposers;
}

function startPollingWatcher(
  resource: ResourceSpec,
  watcher: Extract<WatcherSpec, { type: "polling" }>,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
  ctx: InvokeContext,
): WatcherDisposer {
  const detection = watcher.change_detection ?? "hash";
  let lastHash: string | undefined;

  const tick = async () => {
    try {
      const raw = await invoke(resource.handler, {}, ctx);
      if (raw.isError) {
        process.stderr.write(
          `jig: watcher for "${resource.uri}" handler returned isError: ${raw.content[0]?.text ?? "<no text>"}\n`,
        );
        return;
      }
      const text = raw.content[0]?.text ?? "";
      if (detection === "hash") {
        const hash = createHash("sha256").update(text).digest("hex");
        if (lastHash === undefined) {
          // First tick — establish baseline, no emit.
          lastHash = hash;
          return;
        }
        if (hash === lastHash) return;
        lastHash = hash;
      }
      // change_detection === "always" emits every tick; "hash" emits
      // only when the hash differs. Either way, gate on subscription
      // state.
      if (tracker.isSubscribed(resource.uri)) {
        await server.sendResourceUpdated(resource.uri);
      }
    } catch (err) {
      process.stderr.write(
        `jig: watcher for "${resource.uri}" threw: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, watcher.interval_ms);
  // Don't block process exit on the interval.
  handle.unref();

  // Fire an immediate tick so the baseline hash is captured before the
  // first real interval elapses. Without it, a client that subscribes
  // and mutates the underlying data inside the first interval window
  // would never see an update (the tick-at-interval-1 establishes
  // the baseline based on post-mutation content).
  void tick();

  return () => clearInterval(handle);
}
```

- [ ] **Step 2: Wire into `index.ts`**

In `src/runtime/index.ts`, import the new helper:

```typescript
import { registerResources, startWatchers } from "./resources.ts";
```

After `registerResources(...)` and before `await server.connect(...)`:

```typescript
  const tracker = server.trackSubscriptions();
  if (config.resources) {
    startWatchers(config.resources, server, tracker, ctx);
  }

  await server.connect(createStdioTransport());
```

Important: `trackSubscriptions` MUST be called before `server.connect` (it reaches into the underlying `Server` via `registerCapabilities` and `setRequestHandler`, which must land before the initialize handshake). `startWatchers` MUST be called after registration so the SDK has already run its resource-handler auto-wire.

- [ ] **Step 3: Run the Phase 3 test**

Run: `npm test -- --test-name-pattern="polling watcher emits"`
Expected: PASS.

### Task 3.4: Write a guard test — unsubscribed URIs get no notification

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the guard test**

```typescript
test("polling watcher does not emit when client is not subscribed", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-nosub-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-nosub, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 150
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // No subscribe! Just mutate and wait.
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(statePath, "two");
    await new Promise((r) => setTimeout(r, 600));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.equal(updated, undefined, "no update notification should fire without a subscription");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="polling watcher does not emit"`
Expected: PASS.

### Task 3.5: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): resources: subscribe/unsubscribe + polling watcher

Phase 3 of Plan 6. Lands the "live update" dimension: resources
with watcher: { type: polling, interval_ms: N } re-invoke the
handler on an interval and emit notifications/resources/updated
when the content hash changes — but only when the client has
subscribed to the URI.

Changes:
  - server.ts: JigServerHandle.trackSubscriptions() wires
    resources/subscribe + resources/unsubscribe via the low-level
    server.server.setRequestHandler, declares
    capabilities.resources.subscribe: true, returns a
    SubscriptionTracker { isSubscribed(uri) }
  - server.ts: JigServerHandle.sendResourceUpdated(uri) wraps the
    SDK's notifications/resources/updated emit
  - resources.ts: startPollingWatcher computes a baseline hash on
    first tick, emits only when the hash differs, gates on
    tracker.isSubscribed; change_detection: always bypasses the
    hash check
  - resources.ts: watcher failures (isError, thrown exception)
    log to stderr and skip the emit — the server survives
    transient upstream flakes
  - index.ts: trackSubscriptions() before server.connect;
    startWatchers after registerResources

File watchers land in Phase 4.
```

- [ ] **Step 3: Stage with specific paths**

Stage:
```bash
git add \
  src/runtime/resources.ts \
  src/runtime/server.ts \
  src/runtime/index.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 4: File watcher

**Intent:** Add the `file` watcher branch in `startWatchers`. `fs.watch` on the configured path; emit on any `change` | `rename` event. Path goes through `isPathAllowed` — a path outside `server.security.filesystem.allow` fails at boot.

**Branch:** `feat/plan6-file`

### Task 4.1: Write a failing integration test for file watcher

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the test**

```typescript
test("file watcher emits resources/updated when the watched file changes", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-file-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-file, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: file
      path: ${statePath}
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/subscribe", params: { uri: "config://jig/state" } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // Mutate the file; fs.watch fires immediately on macOS/Linux.
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(statePath, "two");

    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 3_000);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file watcher rejects a path outside the filesystem allowlist at boot", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-file-deny-"));
  const outside = "/etc/hosts"; // well-known path outside $dir
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-file-deny, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      inline: { text: "ok" }
    watcher:
      type: file
      path: ${outside}
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stderrChunks: string[] = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => stderrChunks.push(c));
    child.stdin.end();
    const code: number | null = await new Promise((r) => child.on("close", r));
    assert.equal(code, 1, "server must exit 1 when a watcher path is outside the allowlist");
    const stderr = stderrChunks.join("");
    assert.match(stderr, /watcher path .* not in .* allow/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run — both tests should fail**

Run: `npm test -- --test-name-pattern="file watcher"`
Expected: FAIL — no file-watcher branch in `startWatchers`.

### Task 4.2: Implement the file watcher branch

**Files:**
- Modify: `src/runtime/resources.ts`

- [ ] **Step 1: Add `fs.watch` + access-guard imports**

At the top of `resources.ts` alongside the existing imports:

```typescript
import { watch as fsWatch } from "node:fs";
import { isPathAllowed } from "./util/access.ts";
```

- [ ] **Step 2: Extend `startWatchers` with the file branch**

Replace the body of `startWatchers`:

```typescript
export function startWatchers(
  resources: ResourcesConfig,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
  ctx: InvokeContext,
): WatcherDisposer[] {
  const disposers: WatcherDisposer[] = [];
  for (const spec of resources) {
    if (!spec.watcher) continue;
    if (spec.watcher.type === "polling") {
      disposers.push(startPollingWatcher(spec, spec.watcher, server, tracker, ctx));
    } else if (spec.watcher.type === "file") {
      disposers.push(startFileWatcher(spec, spec.watcher, server, tracker));
    }
  }
  return disposers;
}

function startFileWatcher(
  resource: ResourceSpec,
  watcher: Extract<WatcherSpec, { type: "file" }>,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
): WatcherDisposer {
  if (!isPathAllowed(watcher.path)) {
    // Fail-fast at boot, same stderr shape as probe failures.
    process.stderr.write(
      `jig: resource "${resource.uri}" watcher path "${watcher.path}" is not in server.security.filesystem.allow\n\n`,
    );
    process.exit(1);
  }

  let handle: ReturnType<typeof fsWatch> | undefined;
  try {
    handle = fsWatch(watcher.path, { persistent: false }, (_eventType) => {
      if (tracker.isSubscribed(resource.uri)) {
        void server.sendResourceUpdated(resource.uri).catch((err) => {
          process.stderr.write(
            `jig: watcher emit for "${resource.uri}" failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        });
      }
    });
    handle.on("error", (err) => {
      process.stderr.write(
        `jig: fs.watch for "${resource.uri}" (${watcher.path}) error: ${err.message}\n`,
      );
    });
  } catch (err) {
    process.stderr.write(
      `jig: failed to start fs.watch for "${resource.uri}" (${watcher.path}): ${err instanceof Error ? err.message : String(err)}\n\n`,
    );
    process.exit(1);
  }

  return () => {
    try {
      handle?.close();
    } catch {
      // watcher close errors are fine to swallow on shutdown
    }
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- --test-name-pattern="file watcher"`
Expected: both tests PASS.

### Task 4.3: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): resources: file watcher (fs.watch)

Phase 4 of Plan 6. Adds the file-watcher branch in startWatchers:
watcher: { type: file, path: <p> } subscribes to fs.watch events
on the configured path and emits notifications/resources/updated
when the file changes — gated on the URI being subscribed.

Security:
  - watcher paths go through isPathAllowed from util/access.ts
    (ADR-0009)
  - a path outside server.security.filesystem.allow fails at boot
    with a multi-line stderr block matching the probe-failure
    shape, then process.exit(1)
  - { persistent: false } on fs.watch so the watcher doesn't
    keep the event loop alive past a clean shutdown

fs.watch quirks (platform-coalesced events, rename+create pairs)
are accepted as-is; the emit-on-any-event strategy tolerates
duplicates. Glob paths are deferred.
```

- [ ] **Step 3: Stage with specific paths**

Stage:
```bash
git add \
  src/runtime/resources.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 5: Example + `smoke-resource` + integration round-trip + handoff

**Intent:** Ship the demonstrable artifact. `examples/resources.yaml` covers both watcher types in one file. `just smoke-resource` exercises initialize → resources/list → resources/read → resources/subscribe → polling-driven update → resources/unsubscribe. Handoff names Plan 7 as next.

**Branch:** `feat/plan6-complete`

### Task 5.1: Write `examples/resources.yaml`

**Files:**
- Create: `examples/resources.yaml`

- [ ] **Step 1: Create the example YAML**

**Exec-handler note:** jig's `exec:` handler runs via `execFile` (not a shell) — `${VAR}` shell expansion does NOT happen. Mustache interpolation DOES (`{{probe.X}}`, `{{someArg}}`). For the smoke harness path we use a fixed filesystem location rather than an env var; the `server.security.filesystem.allow` list uses `$VAR` / `~` expansion at boot via `configureAccess` (see `src/runtime/util/access.ts`).

```yaml
# A Plan 6 example that exercises resources + watchers. Demonstrates:
#   - static-uri resource with an inline handler (no watcher)
#   - static-uri resource with an exec handler and a polling watcher
#     (change_detection: hash; emit on content change)
#   - resources/list + resources/read + resources/subscribe round-trip
#
# Run with `just smoke-resource`. Hermetic — no network; the polling
# resource reads a fixed tmp path that the smoke harness writes.
#
# NOTE: the polling watcher re-invokes `exec: "cat ..."` every 500ms.
# Authors declaring polling resources against rate-limited upstreams
# (GitHub API, Linear GraphQL) will hit rate limits — plan intervals
# accordingly.
#
# NOTE: jig's exec handler uses execFile, not sh -c — ${VAR} shell
# expansion doesn't apply inside the command string. Hard-code paths,
# or pass them via a probe (which resolves at boot).

server:
  name: jig-plan6-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 6: resources block, static URIs, polling watcher,
    subscribe/unsubscribe, notifications/resources/updated.
  security:
    filesystem:
      allow:
        - /tmp
        - /private/tmp

resources:
  - uri: config://jig/hello
    name: Hello
    description: A static greeting. No watcher — read-only.
    mimeType: text/plain
    handler:
      inline:
        text: |
          Hello from the Plan 6 example.
          This resource is static — reads are always the same.

  - uri: config://jig/state
    name: Mutable State
    description: Polling-watched content. Smoke harness writes the file before the run.
    mimeType: text/plain
    handler:
      exec: "cat /tmp/jig-plan6-state.txt"
    watcher:
      type: polling
      interval_ms: 500
      change_detection: hash

tools:
  - name: ping
    description: Simple tool so clients that don't surface resources still see something.
    handler:
      inline:
        text: pong
```

- [ ] **Step 2: Verify the YAML parses**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/resources.yaml < /dev/null`
Expected: runtime boots without error. (Will exit because stdin closes immediately, but no parse errors.)

### Task 5.2: Add the `smoke-resource` justfile recipe

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Append the recipe**

Append to `justfile`. Modeled on `smoke-probe`: synchronous request pipe, close stdin, observe stdout. No mid-run mutation here — the polling-watcher-driven update-notification path is covered by the integration test in Task 5.3.

```makefile
# Smoke-resource: verify the Plan 6 example boots, resources/list
# returns both declared resources, resources/read returns the inline
# resource's text, and subscribe/unsubscribe return empty results. The
# polling watcher's update emit is NOT tested here (the integration
# test covers that) — this recipe exercises the synchronous MCP
# surface. Hermetic — no network, no mid-run mutation.
smoke-resource:
    #!/usr/bin/env bash
    set -euo pipefail
    STATE_FILE=/tmp/jig-plan6-state.txt
    echo "smoke-initial" > "$STATE_FILE"
    trap 'rm -f "$STATE_FILE"' EXIT

    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"resources/list"}
    {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"config://jig/hello"}}
    {"jsonrpc":"2.0","id":4,"method":"resources/subscribe","params":{"uri":"config://jig/state"}}
    {"jsonrpc":"2.0","id":5,"method":"resources/unsubscribe","params":{"uri":"config://jig/state"}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/resources.yaml)
    if [ -z "$output" ]; then
      echo "smoke-resource: no response from runtime" >&2
      exit 1
    fi
    # Print the response trio for visual inspection + structural assert
    # via jq on the list+read responses.
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.resources | length == 2' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.contents[0].text | contains("Hello")' >/dev/null
    echo "$output" | tail -4 | jq .
    echo "smoke-resource: OK"
```

- [ ] **Step 2: Run the recipe**

Run: `just smoke-resource`
Expected: `smoke-resource: OK`, exit 0.

### Task 5.3: Write the Plan 6 end-to-end integration test

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the full round-trip test**

```typescript
test("plan 6 resources round-trip: list + read + subscribe + polling update + unsubscribe", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-e2e-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "initial");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server:
  name: plan6-e2e
  version: "0.0.1"
  security:
    filesystem:
      allow: ["${dir}"]
resources:
  - uri: config://jig/hello
    name: Hello
    mimeType: text/plain
    handler:
      inline:
        text: "hi"
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 150
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    send({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    send({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "config://jig/hello" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3'));

    send({ jsonrpc: "2.0", id: 4, method: "resources/subscribe", params: { uri: "config://jig/state" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4'));

    await new Promise((r) => setTimeout(r, 250));
    writeFileSync(statePath, "mutated");
    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 3_000);

    send({ jsonrpc: "2.0", id: 5, method: "resources/unsubscribe", params: { uri: "config://jig/state" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5'));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const list = JSON.parse(stdoutLines.find((l) => l.includes('"id":2'))!) as { result: { resources: Array<{ uri: string }> } };
    assert.equal(list.result.resources.length, 2);
    const read = JSON.parse(stdoutLines.find((l) => l.includes('"id":3'))!) as { result: { contents: Array<{ text: string }> } };
    assert.equal(read.result.contents[0]!.text, "hi");
    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.ok(updated, "update notification");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="plan 6 resources round-trip"`
Expected: PASS.

### Task 5.4: Run every gate one last time

- [ ] **Step 1: Full gate sweep**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS.

### Task 5.5: Write the handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan6-complete.md` (timestamp via `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Generate the Eastern-time timestamp**

Run: `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`
Note the output; use it in the filename.

- [ ] **Step 2: Write the handoff**

Use the building-in-the-open `curating-context` skill to generate the handoff (the building-in-the-open plugin hook on SessionStart points to it). The handoff should cover:

- Overall state (green, main carries Plan 6)
- What Plan 6 delivered — resources block, static URIs, resources/list + resources/read, subscribe/unsubscribe via server.server, polling + file watchers, notifications/resources/updated gated on subscription
- Key decisions (polling interval hash baseline on first tick, watchers run unconditionally, persistent: false on fs.watch, security.filesystem.allow enforced at watcher start)
- What's next — Plan 7 (prompts + completions with URI templates) and Plan 8 (tasks + state machines)
- Landmines (fs.watch platform quirks, polling and rate-limited upstreams, `server.server` crossing for subscribe handlers is the only SDK-surface crossing outside server.ts)
- Repeat the pre-dispatch scan guidance carried over from Plan 4/5 handoffs

### Task 5.6: Commit Phase 5

- [ ] **Step 1: Write the commit message**

```
feat(runtime): plan 6 example, smoke-resource, integration, handoff

Phase 5 of Plan 6 — the demonstrable artifact.

  - examples/resources.yaml: static inline resource + polling-
    watched exec resource; demonstrates resources/list,
    resources/read, subscribe/update/unsubscribe in one file
  - justfile: smoke-resource recipe drives a FIFO-backed request
    sequence through the runtime, asserts the list count, the
    inline read payload, and the polling-driven updated
    notification
  - tests/integration.test.ts: end-to-end round-trip covering
    list + read + subscribe + polling update + unsubscribe
  - .handoffs/…-plan6-complete.md: handoff document for the next
    session

Plan 6 complete with this commit. Eight gates pass:
npm run check, npm test, just smoke, just smoke-dispatch, just
smoke-compute, just smoke-http, just smoke-probe, just
smoke-resource.
```

- [ ] **Step 2: Stage with specific paths**

Stage:
```bash
git add \
  examples/resources.yaml \
  justfile \
  tests/integration.test.ts \
  .handoffs/
```

Clay: `gtxt && git pm`

---

## Self-review checklist (run after writing the plan)

- **Spec coverage:** every numbered bullet in the Plan 6 design doc `### Approach` section maps to a phase task:
  - Schema additions → Phase 1 ✓
  - Handler reuse + read translation → Phase 2 ✓
  - Boot sequence → Phase 2 Task 2.3 Step 3 ✓
  - Subscribe/unsubscribe wiring → Phase 3 Task 3.1 ✓
  - Polling watcher → Phase 3 Task 3.3 ✓
  - File watcher → Phase 4 Task 4.2 ✓
  - Capabilities advertised → Phase 3 Task 3.1 Step 4 (registerCapabilities call) ✓
- **Type consistency:** `ResourceSpec`, `WatcherSpec`, `ResourcesConfig`, `SubscriptionTracker`, `WatcherDisposer`, `RegisteredResourceHandle` names are consistent across all phases.
- **No placeholders:** every step has either a code block, a concrete command, or an explicit deferred-to-later-phase comment.
- **File paths exact:** every Files block cites a real path from the existing repo or a new path in the right directory.
- **Commands with expected outputs:** every `Run:` step names the expected PASS/FAIL outcome.

## Landmines (to surface in the handoff)

- **SDK high-level class omits subscribe/unsubscribe.** Plan 6 reaches into `server.server.setRequestHandler` in exactly one place (`server.ts` `trackSubscriptions`). If the SDK adds high-level `registerSubscribe` / `registerUnsubscribe` methods in a future 2.x release, the adapter can swap — but don't port blindly; verify the high-level class still emits `capabilities.resources.subscribe` with the right shape.
- **`fs.watch` platform quirks.** macOS coalesces change events into a single `rename` on some editors' atomic save; Linux delivers raw `change`. The emit-on-any-event strategy accepts duplicates. Windows is out of scope (jig is macOS-first).
- **Polling watchers + rate-limited upstreams.** A `watcher: { type: polling, interval_ms: 5000 }` on a `http:` handler against a rate-limited API will hit the rate limit. Document in the example YAML and the handoff.
- **`persistent: false` is required on `fs.watch`.** Without it the watcher handle keeps the event loop alive past a clean shutdown — Node won't exit even when stdin closes. Verify the integration tests exit cleanly.
- **Plan doc code blocks have defects.** Pre-flight scan before dispatching (Plan 4 caught 5, Plan 5 caught 4). Check:
  - Every `import` in plan code blocks against actual module exports. Especially check `SubscribeRequestSchema` / `UnsubscribeRequestSchema` re-export at the SDK package root before Phase 3 starts.
  - Cross-phase ordering — Phase 2's `RegisterResourceSpec` + `ResourceHandler` types must be in place before Phase 3's `trackSubscriptions` references them indirectly.
  - Assertion expectations against SDK behavior — the SDK wraps thrown Errors from read callbacks into `InternalError` JSON-RPC errors, not `InvalidParams`. Phase 2 Task 2.4 Step 1 `readResp.error!.message` match may need adjustment.
