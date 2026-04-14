# jig Runtime — Plan 3 (JSONLogic + compute + guards + transforms + helpers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add JSONLogic as the single conditional-logic layer across `compute:` handlers (pure evaluation), `when:` guards on dispatch cases, and `transform:` response reshaping at the tool level — along with the 16 built-in helpers specified in [ADR-0008](../decisions/0008-jsonlogic-builtin-helpers.md) so guards can inspect the filesystem, environment, paths, OS, and wall-clock time declaratively.

**Architecture:** Four new runtime surfaces land in order. (1) `src/runtime/util/jsonlogic.ts` wraps `json-logic-engine` v5's async engine, exports `evaluate(logic, data)` and the typed `JsonLogicRule` alias, and owns helper registration. (2) `src/runtime/util/helpers.ts` implements the 16 read-only helpers from ADR-0008 (file, env, path, os, time) and a `registerHelpers(engine)` entry point the jsonlogic module calls at init. (3) `src/runtime/handlers/compute.ts` is a pure handler that runs `evaluate(logic, args)` and returns the result as text content. (4) `src/runtime/handlers/dispatch.ts` gains per-case `when:` evaluation (AND-composed with `requires:`); `src/runtime/index.ts` applies optional tool-level `transform:` to handler results before returning them to the client.

**Tech Stack:** Adds `json-logic-engine@5.x` as the single new production dependency. Node 24+, TypeScript 5.7+, `node:test`, `yaml`, `@modelcontextprotocol/server@2.0.0-alpha.x` unchanged.

---

## Scope Note

This is **plan 3 of ~7** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)).

**Planned sequence:**

1. Plan 1 — smoke test (merged) — stdio MCP + inline tool
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. **Plan 3 — JSONLogic + `compute` + guards + transforms + helpers** (this plan)
4. Plan 4 — `connections:`, `probes:`, `http` / `graphql` handlers
5. Plan 5 — resources (+ watchers), prompts, completions, tasks (state machines)
6. Plan 6 — CLI (`jig new|dev|validate|build`)
7. Plan 7 — build pipeline (esbuild single-file, `.mcpb`, `extension_points:` composition, HTTP transport)

**Out of scope for Plan 3 (carried to later plans):**

- `connections:` block, `probes:` block, `http` handler, `graphql` handler. Plan 4. Implies: helpers do not reach the network; probes cover startup-time data.
- Author-registered custom helpers (per [ADR-0008](../decisions/0008-jsonlogic-builtin-helpers.md)). The 16-helper set is fixed for v1.
- Resources, prompts, completions, tasks, `user_config:`, `extension_points:`. Plan 5+.
- `help: { auto: true }` synthesis from dispatch + `when:` specs. Plan 4 at earliest.
- Guards on state-machine transitions. Plan 5 (task engine).
- Case-level `transform:` (tool-level is the only location Plan 3 supports). Revisit only when a real need surfaces.
- Handler-level `transform:` across non-dispatch tools. Same reasoning — tool-level is sufficient for v1.
- Advanced JSONLogic operators beyond what `json-logic-engine` ships by default. No custom operator additions besides the 16 helpers.

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **Quarantine holds.** SDK imports (`@modelcontextprotocol/*`) stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. JSONLogic, helpers, compute, guards, and transforms must not import from the SDK.
- **No network.** Helpers do not reach out to DNS, HTTP, or any upstream. Probes and `http:`/`graphql:` handlers (Plan 4) cover network-bound reads.
- **Helpers never throw.** Every helper returns `null` (value-bearing) or `false` (boolean) on any failure per ADR-0008. A throwing helper in a guard becomes an MCP protocol error instead of "this guard did not pass," which is hostile to authors.
- **Three gates must all pass before commit.** `npm run check && npm test && just smoke && just smoke-dispatch` — typecheck catches structural mismatches JSON equality hides (bit Plan 1 Phase 4). The dispatcher smoke stays green through all phases.
- **Commits via `commit.txt`.** Every commit step writes the message to `commit.txt`; Clay runs `gtxt` (`git commit -F commit.txt && rm commit.txt`) and `git pm` (push + PR + auto-merge). Never `git commit` directly.
- **Feature branch per phase.** `feat/plan3-doc`, `feat/plan3-jsonlogic`, `feat/plan3-helpers`, `feat/plan3-compute`, `feat/plan3-guards`, `feat/plan3-transform`, `feat/plan3-complete`. Each phase lands on main before the next starts.
- **Integration tests carry `{ timeout: 10_000 }`.** Subprocess-based tests hang forever on bugs without it.

## File Structure

```
jig/
  record/
    plans/
      2026-04-14-jig-runtime-plan3.md  # this plan (Phase 0)
  src/
    runtime/
      util/
        jsonlogic.ts                   # Engine wrapper + evaluate() (Phase 1)
        helpers.ts                     # 16 built-in helpers + registerHelpers() (Phase 2)
      handlers/
        compute.ts                     # compute handler (Phase 3)
        dispatch.ts                    # + when evaluation (Phase 4)
        index.ts                       # + compute arm in invoke() (Phase 3)
      config.ts                        # Handler union + DispatchCase.when + ToolDefinition.transform (Phases 3–5)
      index.ts                         # + transform application after invoke() (Phase 5)
  tests/
    jsonlogic.test.ts                  # Engine + evaluate() unit tests (Phase 1)
    helpers.test.ts                    # Per-namespace helper unit tests (Phase 2)
    handlers.test.ts                   # + compute + when tests (Phases 3, 4)
    config.test.ts                     # + compute/when/transform config tests (Phases 3–5)
    integration.test.ts                # + compute + guard + transform round-trip (Phase 6)
    fixtures/
      helpers/                         # filesystem fixtures used by helpers.test.ts (Phase 2)
        present.txt
        subdir/
          nested.txt
  examples/
    compute-and-guards.yaml            # Phase 6
  justfile                             # new `smoke-compute` recipe (Phase 6)
  package.json                         # + json-logic-engine dep (Phase 1)
```

**Not in Plan 3:** anything under `src/runtime/resources.ts`, `prompts.ts`, `tasks.ts`, `transports/http.ts`, `handlers/http.ts`, `handlers/graphql.ts`, `handlers/probe.ts`, `util/env.ts`, `src/cli/`. Those arrive in later plans.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 3 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `feat/plan3-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 3 (JSONLogic + compute + guards + transforms + helpers)

Phase 0 of jig runtime Plan 3 — the plan doc itself. Subsequent phases
land on feat/plan3-jsonlogic, feat/plan3-helpers, feat/plan3-compute,
feat/plan3-guards, feat/plan3-transform, feat/plan3-complete.

Plan 3 delivers: json-logic-engine v5 wired up as the single conditional-
logic layer; 16 read-only helpers per ADR-0008 (file / env / path / os /
time); compute: handler for pure evaluation; when: guards on dispatch
cases (AND-composed with requires:); tool-level transform: for response
reshaping. Example YAML + smoke-compute target round-trip all four.

Out of scope per the scope note: connections/probes/http/graphql (Plan
4); case-level or handler-level transform (tool-level only); author-
registered helpers (fixed set per ADR-0008).
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

Expected: Plan 3 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: `json-logic-engine` wrapper

**Intent:** Land `src/runtime/util/jsonlogic.ts` — a thin wrapper around `json-logic-engine` v5's async engine. Exports `evaluate(logic, data)`, the `JsonLogicRule` type alias, and a shared engine singleton. No helpers registered yet (Phase 2). This phase verifies the library's API, establishes the engine lifecycle, and gives later phases a stable import surface.

**Branch:** `feat/plan3-jsonlogic`

### Task 1.1: Add `json-logic-engine` to dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependency**

Edit `package.json` and add to `"dependencies"`:

```json
"json-logic-engine": "^5.0.0"
```

The full `"dependencies"` block becomes:

```json
"dependencies": {
  "@cfworker/json-schema": "^4.1.1",
  "@modelcontextprotocol/server": "2.0.0-alpha.2",
  "json-logic-engine": "^5.0.0",
  "yaml": "^2.8.3"
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: adds `json-logic-engine@5.x` to `node_modules`, updates `package-lock.json`.

- [ ] **Step 3: Verify the API surface matches expectations**

Run an ad-hoc check (this is a one-time sanity test, not committed):

```bash
node --input-type=module -e '
import { AsyncLogicEngine } from "json-logic-engine";
const engine = new AsyncLogicEngine();
engine.addMethod("hello", async ([name]) => "hello " + name);
const out = await engine.run({ "hello": ["world"] });
console.log(out);
'
```

Expected stdout: `hello world`.

If the import path is different (`json-logic-engine/async`, etc.) or the class is not `AsyncLogicEngine`, update Tasks 1.3–1.4 to match before proceeding. v5 ships the async engine as a named export; if the observed API differs, capture the actual shape in a short note at the top of `util/jsonlogic.ts` and adjust the implementation to match.

### Task 1.2: Write failing tests for `evaluate`

**Files:**
- Create: `tests/jsonlogic.test.ts`

- [ ] **Step 1: Write the file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";

test("evaluate resolves a literal value", async () => {
  const result = await evaluate(42 as JsonLogicRule, {});
  assert.equal(result, 42);
});

test("evaluate resolves a var reference against data", async () => {
  const result = await evaluate({ var: "name" } as JsonLogicRule, { name: "Ada" });
  assert.equal(result, "Ada");
});

test("evaluate resolves a comparison", async () => {
  const rule: JsonLogicRule = { "==": [{ var: "a" }, 1] };
  assert.equal(await evaluate(rule, { a: 1 }), true);
  assert.equal(await evaluate(rule, { a: 2 }), false);
});

test("evaluate resolves AND logic", async () => {
  const rule: JsonLogicRule = {
    and: [
      { "==": [{ var: "a" }, 1] },
      { ">": [{ var: "b" }, 0] },
    ],
  };
  assert.equal(await evaluate(rule, { a: 1, b: 5 }), true);
  assert.equal(await evaluate(rule, { a: 1, b: -1 }), false);
});

test("evaluate treats a missing var as null (not thrown)", async () => {
  const result = await evaluate({ var: "missing" } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("evaluate returns a nested object when the rule is an object literal under `preserve`", async () => {
  // json-logic-engine's `preserve` operator keeps a nested object as-is
  // without trying to evaluate its keys as operators.
  const rule: JsonLogicRule = { preserve: { k: 1 } };
  assert.deepEqual(await evaluate(rule, {}), { k: 1 });
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/util/jsonlogic.ts'`.

### Task 1.3: Implement `jsonlogic.ts`

**Files:**
- Create: `src/runtime/util/jsonlogic.ts`

- [ ] **Step 1: Write the file**

```typescript
import { AsyncLogicEngine } from "json-logic-engine";

/**
 * Central JSONLogic evaluation surface for the jig runtime.
 *
 * Plan 3 uses this engine in three places:
 *   - compute: handler — evaluate(logic, args) returns the value directly
 *   - when: guard on dispatch cases — evaluate(logic, args) must be truthy
 *   - transform: at tool level — evaluate(logic, { result, args }) reshapes output
 *
 * Helpers per ADR-0008 register against this engine; see util/helpers.ts
 * (wired in Phase 2). Keeping the engine singleton means helpers are
 * registered once at module init and every caller shares the same
 * compiled-rule cache.
 *
 * The async engine is always used, even for sync-underlying helpers.
 * One engine, one evaluation model, matches ADR-0002.
 */

/**
 * Opaque JSONLogic rule type. Rules are arbitrary JSON — anything the
 * engine accepts. We carry this alias so call sites don't spray
 * `unknown` through every type annotation.
 */
export type JsonLogicRule = unknown;

const engine = new AsyncLogicEngine();

/**
 * Evaluate a JSONLogic rule against a data context.
 *
 * Delegates to `AsyncLogicEngine.run`. Returns whatever the engine
 * produces: primitives pass through, operators return values, missing
 * vars resolve to null (not thrown), and unknown operators throw at the
 * engine boundary — which dispatch-level and handler-level callers must
 * catch and surface as isError tool results, not JSON-RPC errors.
 */
export async function evaluate(
  rule: JsonLogicRule,
  data: Record<string, unknown>,
): Promise<unknown> {
  return engine.run(rule, data);
}

/**
 * Module-internal accessor for helper registration. Phase 2's
 * util/helpers.ts calls this once at import time to register the 16
 * read-only helpers from ADR-0008. Not exported — callers outside the
 * runtime cannot mutate the engine.
 */
export function getEngine(): AsyncLogicEngine {
  return engine;
}
```

- [ ] **Step 2: Run tests; verify the GREEN**

Run: `npm test`
Expected: all jsonlogic tests pass; earlier tests remain green.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: clean. If TypeScript complains about `AsyncLogicEngine` lacking types, check whether `json-logic-engine` ships `.d.ts` files; if not, add a minimal declaration file at `src/types/json-logic-engine.d.ts`:

```typescript
declare module "json-logic-engine" {
  export class AsyncLogicEngine {
    addMethod(name: string, fn: (args: unknown[]) => unknown | Promise<unknown>): void;
    run(logic: unknown, data?: unknown): Promise<unknown>;
  }
}
```

And include `"src/types/**/*.d.ts"` in `tsconfig.json`'s `include` array if it isn't already.

### Task 1.4: Commit Phase 1

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): json-logic-engine wrapper (evaluate + engine singleton)

Adds src/runtime/util/jsonlogic.ts — a thin wrapper around
AsyncLogicEngine from json-logic-engine v5. Exports evaluate(logic,
data), JsonLogicRule type alias, and a module-internal getEngine()
accessor for helper registration.

Adds json-logic-engine@^5.0.0 as a production dependency. The engine is
a module-level singleton so helpers (Phase 2) register once and every
caller shares the same compiled-rule cache. Missing vars resolve to
null; no helpers registered yet — that's Phase 2.

Per ADR-0002 (JSONLogic via json-logic-engine) and ADR-0008 (read-only
helpers). Compute, guards, and transforms land in Phases 3–5.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 2: Built-in helpers (16 per ADR-0008)

**Intent:** Implement the 16 helpers from ADR-0008 in a single `util/helpers.ts` file (all five namespaces — file, env, path, os, time) and wire them into the engine at `util/jsonlogic.ts` import time. Each helper is read-only, never throws, and resolves relative paths from `dirname(fileURLToPath(import.meta.url))` per ADR-0005. Unit tests exercise present/missing/invalid inputs per namespace.

**Branch:** `feat/plan3-helpers`

### Task 2.1: Write fixture files

**Files:**
- Create: `tests/fixtures/helpers/present.txt`
- Create: `tests/fixtures/helpers/subdir/nested.txt`

- [ ] **Step 1: Create the files**

`tests/fixtures/helpers/present.txt` — single line:

```
present
```

`tests/fixtures/helpers/subdir/nested.txt` — single line:

```
nested
```

The test file at `tests/fixtures/helpers/present.txt` is referenced by `file.exists` / `file.is_file` / `file.size` tests; the `subdir/` directory is referenced by `file.is_dir` tests.

### Task 2.2: Write failing tests for all 16 helpers

**Files:**
- Create: `tests/helpers.test.ts`

- [ ] **Step 1: Write the file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform as nodePlatform, arch as nodeArch, homedir, tmpdir } from "node:os";
import { evaluate, type JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";
// Side-effect import: registers the 16 helpers on the shared engine.
import "../src/runtime/util/helpers.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures", "helpers");
const PRESENT_FILE = join(FIXTURE_DIR, "present.txt");
const MISSING_FILE = join(FIXTURE_DIR, "definitely-missing.txt");
const SUBDIR = join(FIXTURE_DIR, "subdir");

// --- file namespace -------------------------------------------------------

test("file.exists returns true for an existing file", async () => {
  const rule: JsonLogicRule = { "file.exists": [PRESENT_FILE] };
  assert.equal(await evaluate(rule, {}), true);
});

test("file.exists returns false for a missing path", async () => {
  const rule: JsonLogicRule = { "file.exists": [MISSING_FILE] };
  assert.equal(await evaluate(rule, {}), false);
});

test("file.exists returns false (never throws) for garbage input", async () => {
  const rule: JsonLogicRule = { "file.exists": [null] };
  assert.equal(await evaluate(rule, {}), false);
});

test("file.is_file returns true for a regular file, false for a directory", async () => {
  assert.equal(await evaluate({ "file.is_file": [PRESENT_FILE] } as JsonLogicRule, {}), true);
  assert.equal(await evaluate({ "file.is_file": [SUBDIR] } as JsonLogicRule, {}), false);
});

test("file.is_dir returns true for a directory, false for a regular file", async () => {
  assert.equal(await evaluate({ "file.is_dir": [SUBDIR] } as JsonLogicRule, {}), true);
  assert.equal(await evaluate({ "file.is_dir": [PRESENT_FILE] } as JsonLogicRule, {}), false);
});

test("file.size returns byte count for an existing file", async () => {
  // "present\n" = 8 bytes on disk.
  const result = await evaluate({ "file.size": [PRESENT_FILE] } as JsonLogicRule, {});
  assert.equal(typeof result, "number");
  assert.ok((result as number) >= 7); // tolerate trailing newline variance
});

test("file.size returns null for a missing path", async () => {
  const result = await evaluate({ "file.size": [MISSING_FILE] } as JsonLogicRule, {});
  assert.equal(result, null);
});

// --- env namespace --------------------------------------------------------

test("env.get returns the value when the variable is set", async () => {
  process.env["JIG_HELPERS_TEST_SET"] = "found";
  try {
    const result = await evaluate({ "env.get": ["JIG_HELPERS_TEST_SET"] } as JsonLogicRule, {});
    assert.equal(result, "found");
  } finally {
    delete process.env["JIG_HELPERS_TEST_SET"];
  }
});

test("env.get returns null when the variable is not set", async () => {
  delete process.env["JIG_HELPERS_TEST_MISSING"];
  const result = await evaluate({ "env.get": ["JIG_HELPERS_TEST_MISSING"] } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("env.has returns true when the variable is set (even to empty string)", async () => {
  process.env["JIG_HELPERS_TEST_EMPTY"] = "";
  try {
    const result = await evaluate({ "env.has": ["JIG_HELPERS_TEST_EMPTY"] } as JsonLogicRule, {});
    assert.equal(result, true);
  } finally {
    delete process.env["JIG_HELPERS_TEST_EMPTY"];
  }
});

test("env.has returns false when the variable is not set", async () => {
  delete process.env["JIG_HELPERS_TEST_UNSET"];
  const result = await evaluate({ "env.has": ["JIG_HELPERS_TEST_UNSET"] } as JsonLogicRule, {});
  assert.equal(result, false);
});

// --- path namespace -------------------------------------------------------

test("path.join joins segments with the platform separator", async () => {
  const result = await evaluate({ "path.join": ["a", "b", "c"] } as JsonLogicRule, {});
  assert.equal(result, join("a", "b", "c"));
});

test("path.join returns null when any segment is non-string", async () => {
  const result = await evaluate({ "path.join": ["a", null, "c"] } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("path.resolve returns an absolute path", async () => {
  const result = await evaluate({ "path.resolve": ["relative/thing"] } as JsonLogicRule, {});
  assert.equal(typeof result, "string");
  assert.ok((result as string).length > 0);
  // Must be absolute — starts with / on POSIX, drive letter on Windows.
  assert.ok(/^([/]|[A-Za-z]:)/.test(result as string));
});

test("path.dirname returns the parent directory", async () => {
  const result = await evaluate({ "path.dirname": ["/a/b/c.txt"] } as JsonLogicRule, {});
  assert.equal(result, "/a/b");
});

test("path.basename returns the last segment", async () => {
  const result = await evaluate({ "path.basename": ["/a/b/c.txt"] } as JsonLogicRule, {});
  assert.equal(result, "c.txt");
});

test("path.basename returns null on non-string input", async () => {
  const result = await evaluate({ "path.basename": [null] } as JsonLogicRule, {});
  assert.equal(result, null);
});

// --- os namespace ---------------------------------------------------------

test("os.platform returns the process platform", async () => {
  const result = await evaluate({ "os.platform": [] } as JsonLogicRule, {});
  assert.equal(result, nodePlatform());
});

test("os.arch returns the process arch", async () => {
  const result = await evaluate({ "os.arch": [] } as JsonLogicRule, {});
  assert.equal(result, nodeArch());
});

test("os.homedir returns the home directory", async () => {
  const result = await evaluate({ "os.homedir": [] } as JsonLogicRule, {});
  assert.equal(result, homedir());
});

test("os.tmpdir returns the tmp directory", async () => {
  const result = await evaluate({ "os.tmpdir": [] } as JsonLogicRule, {});
  assert.equal(result, tmpdir());
});

// --- time namespace -------------------------------------------------------

test("time.now returns a recent millisecond timestamp", async () => {
  const before = Date.now();
  const result = await evaluate({ "time.now": [] } as JsonLogicRule, {});
  const after = Date.now();
  assert.equal(typeof result, "number");
  assert.ok((result as number) >= before);
  assert.ok((result as number) <= after);
});

test("time.iso returns an ISO-8601 string", async () => {
  const result = await evaluate({ "time.iso": [] } as JsonLogicRule, {});
  assert.equal(typeof result, "string");
  // ISO-8601 sanity check: YYYY-MM-DDTHH:MM:SS.sssZ
  assert.match(result as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// --- composition ---------------------------------------------------------

test("helpers compose: file.exists(path.join(env.get(HOME), x))", async () => {
  // Uses a fixture path reachable from the repo root. Build up via
  // chained helpers to prove the async engine awaits nested calls.
  process.env["JIG_HELPERS_TEST_ROOT"] = FIXTURE_DIR;
  try {
    const rule: JsonLogicRule = {
      "file.exists": [
        {
          "path.join": [
            { "env.get": ["JIG_HELPERS_TEST_ROOT"] },
            "present.txt",
          ],
        },
      ],
    };
    assert.equal(await evaluate(rule, {}), true);
  } finally {
    delete process.env["JIG_HELPERS_TEST_ROOT"];
  }
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/util/helpers.ts'`.

### Task 2.3: Implement `helpers.ts`

**Files:**
- Create: `src/runtime/util/helpers.ts`

- [ ] **Step 1: Write the file**

```typescript
import { statSync, accessSync, constants as fsConstants } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch, homedir, tmpdir } from "node:os";
import { getEngine } from "./jsonlogic.ts";

/**
 * Built-in JSONLogic helpers per ADR-0008 (16 helpers across 5 namespaces).
 *
 * Every helper:
 *   - Returns null (value-bearing) or false (boolean) on any failure
 *   - Never throws — a thrown exception in a guard poisons dispatch
 *   - Resolves relative paths against dirname(import.meta.url) per ADR-0005
 *   - Is side-effect-free (read-only)
 *
 * This module registers against the shared engine from util/jsonlogic.ts
 * at import time. Callers pull in this module for its side effects.
 */

// Server-root fallback. When authors pass a relative path to a file/path
// helper, resolve it against the directory the runtime lives in — the
// same rule as ADR-0005 for sibling YAML discovery.
const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));

function resolveRelative(input: string): string {
  if (isAbsolute(input)) return input;
  return pathResolve(RUNTIME_ROOT, input);
}

// --- file namespace -------------------------------------------------------

function fileExists([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  try {
    accessSync(resolveRelative(rawPath), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function fileIsFile([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  try {
    return statSync(resolveRelative(rawPath)).isFile();
  } catch {
    return false;
  }
}

function fileIsDir([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  try {
    return statSync(resolveRelative(rawPath)).isDirectory();
  } catch {
    return false;
  }
}

function fileSize([rawPath]: unknown[]): number | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    return statSync(resolveRelative(rawPath)).size;
  } catch {
    return null;
  }
}

// --- env namespace --------------------------------------------------------

function envGet([rawName]: unknown[]): string | null {
  if (typeof rawName !== "string" || rawName.length === 0) return null;
  const value = process.env[rawName];
  return value === undefined ? null : value;
}

function envHas([rawName]: unknown[]): boolean {
  if (typeof rawName !== "string" || rawName.length === 0) return false;
  return Object.prototype.hasOwnProperty.call(process.env, rawName);
}

// --- path namespace -------------------------------------------------------

function pathJoinHelper(parts: unknown[]): string | null {
  if (parts.length === 0) return null;
  const strings: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") return null;
    strings.push(part);
  }
  try {
    return pathJoin(...strings);
  } catch {
    return null;
  }
}

function pathResolveHelper([rawPath]: unknown[]): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    return resolveRelative(rawPath);
  } catch {
    return null;
  }
}

function pathDirname([rawPath]: unknown[]): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    return dirname(rawPath);
  } catch {
    return null;
  }
}

function pathBasename(args: unknown[]): string | null {
  const [rawPath, ext] = args;
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    if (typeof ext === "string") return basename(rawPath, ext);
    return basename(rawPath);
  } catch {
    return null;
  }
}

// --- os namespace ---------------------------------------------------------

function osPlatform(): string {
  return platform();
}

function osArch(): string {
  return arch();
}

function osHomedir(): string | null {
  try {
    return homedir();
  } catch {
    return null;
  }
}

function osTmpdir(): string | null {
  try {
    return tmpdir();
  } catch {
    return null;
  }
}

// --- time namespace -------------------------------------------------------

function timeNow(): number {
  return Date.now();
}

function timeIso(): string {
  return new Date().toISOString();
}

// --- registration ---------------------------------------------------------

/**
 * Register all 16 helpers on the shared engine. Called once at module
 * load. `addMethod` accepts sync functions in json-logic-engine v5's
 * async engine — the engine awaits whatever the method returns, so
 * wrapping a sync read as async is unnecessary.
 */
export function registerHelpers(): void {
  const engine = getEngine();

  engine.addMethod("file.exists", fileExists);
  engine.addMethod("file.is_file", fileIsFile);
  engine.addMethod("file.is_dir", fileIsDir);
  engine.addMethod("file.size", fileSize);

  engine.addMethod("env.get", envGet);
  engine.addMethod("env.has", envHas);

  engine.addMethod("path.join", pathJoinHelper);
  engine.addMethod("path.resolve", pathResolveHelper);
  engine.addMethod("path.dirname", pathDirname);
  engine.addMethod("path.basename", pathBasename);

  engine.addMethod("os.platform", osPlatform);
  engine.addMethod("os.arch", osArch);
  engine.addMethod("os.homedir", osHomedir);
  engine.addMethod("os.tmpdir", osTmpdir);

  engine.addMethod("time.now", timeNow);
  engine.addMethod("time.iso", timeIso);
}

// Register on module import so side-effect imports pick everything up.
registerHelpers();
```

- [ ] **Step 2: Run tests; verify the GREEN**

Run: `npm test`
Expected: all 22 helper tests pass (16 per-helper + 6 composition/edge tests in one file); existing tests still green.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 2.4: Ensure the runtime loads helpers at startup

**Files:**
- Modify: `src/runtime/index.ts`

The runtime must import `helpers.ts` so registration happens before any tool call. Phases 3/4/5 will import it transitively via compute/dispatch, but Phase 2 adds an explicit import so the engine is always populated even if later phases change their import graph.

- [ ] **Step 1: Add the import**

Edit `src/runtime/index.ts`. Add this line near the top of the imports, alongside the existing imports:

```typescript
// Side-effect: registers the 16 built-in JSONLogic helpers per ADR-0008.
// Keeps registration centralized at runtime boot rather than deferred
// until a compute/when/transform rule triggers a helper lookup.
import "./util/helpers.ts";
```

- [ ] **Step 2: Typecheck + unit tests + smoke**

Run: `npm run check && npm test && just smoke && just smoke-dispatch`
Expected: clean across all four gates.

### Task 2.5: Commit Phase 2

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): 16 built-in JSONLogic helpers (file/env/path/os/time)

Implements ADR-0008 in full: adds src/runtime/util/helpers.ts with 16
read-only helpers across five namespaces —

  file.exists, file.is_file, file.is_dir, file.size
  env.get, env.has
  path.join, path.resolve, path.dirname, path.basename
  os.platform, os.arch, os.homedir, os.tmpdir
  time.now, time.iso

Every helper returns null or false on any failure; no helper throws. A
thrown exception in a guard would poison dispatch and surface as an MCP
protocol error instead of "this guard did not pass." Relative paths
resolve from dirname(import.meta.url) per ADR-0005.

Registration happens at module load via a side-effect import in
src/runtime/index.ts, so every tool call sees a fully populated engine.
tests/helpers.test.ts covers present/missing/invalid inputs per
namespace plus a composition test (file.exists ∘ path.join ∘ env.get).
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 3: `compute` handler

**Intent:** Land `src/runtime/handlers/compute.ts` — a pure handler that evaluates a JSONLogic rule against the tool call's args and returns the result as text content. Widen the `Handler` union to include `ComputeHandler`; extend `validateHandler` to parse compute YAML; add the `compute` arm to the central `invoke()` switch.

**Branch:** `feat/plan3-compute`

### Task 3.1: Extend config types for `ComputeHandler`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the `ComputeHandler` interface and widen `Handler`**

Add after the existing `DispatchHandler` declaration:

```typescript
import type { JsonLogicRule } from "./util/jsonlogic.ts";

export interface ComputeHandler {
  compute: JsonLogicRule;
}
```

(If `JsonLogicRule` is already imported elsewhere in the file, consolidate the import rather than duplicating.)

Update the `Handler` union:

```typescript
export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler;
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: **FAIL** — `src/runtime/handlers/index.ts`'s `invoke()` uses `const _never: never = handler;` to force exhaustive narrowing. Adding a new variant to `Handler` should break typecheck until Task 3.5 wires it in. That's the intended signal.

Capture this as a red expected-failure in the task log; it turns green in Task 3.5.

### Task 3.2: Write failing tests for `invokeCompute`

**Files:**
- Modify: `tests/handlers.test.ts` (append)

- [ ] **Step 1: Append the tests**

Add to the imports at the top of `tests/handlers.test.ts`:

```typescript
import { invokeCompute } from "../src/runtime/handlers/compute.ts";
import type { ComputeHandler } from "../src/runtime/config.ts";
// Side-effect: ensures helpers are registered before the compute tests run.
import "../src/runtime/util/helpers.ts";
```

Append the tests:

```typescript
test("invokeCompute evaluates a simple var reference", async () => {
  const handler: ComputeHandler = { compute: { var: "name" } };
  const result = await invokeCompute(handler, { name: "Ada" });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "Ada");
});

test("invokeCompute evaluates a helper call", async () => {
  const handler: ComputeHandler = { compute: { "os.platform": [] } };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(typeof result.content[0]!.text, "string");
  assert.ok(result.content[0]!.text.length > 0);
});

test("invokeCompute JSON-stringifies object results", async () => {
  // preserve keeps the object literal from being interpreted as operators.
  const handler: ComputeHandler = {
    compute: { preserve: { a: 1, b: "two" } },
  };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, '{"a":1,"b":"two"}');
});

test("invokeCompute stringifies null/undefined as the literal strings", async () => {
  const handler: ComputeHandler = { compute: { var: "missing" } };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "null");
});

test("invokeCompute returns isError when the engine throws", async () => {
  // An unknown operator throws at the engine boundary.
  const handler: ComputeHandler = { compute: { unknownOperator: [1, 2] } as unknown };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /compute:/i);
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/handlers/compute.ts'`.

### Task 3.3: Extend `validateHandler` for compute

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the compute branch**

Inside `validateHandler`, after the `dispatch` branch and before the final throw, add:

```typescript
if ("compute" in h) {
  // JSONLogic rules are arbitrary JSON; we do no structural validation
  // at parse time. Unknown operators surface at invoke time as isError
  // tool results, not as config errors.
  return { compute: h["compute"] };
}
```

And update the terminal error message to include compute in the supported list:

```typescript
throw new Error(
  `config: tools[${toolName}].handler has no supported handler type (Plan 3 supports: inline, exec, dispatch, compute)`,
);
```

- [ ] **Step 2: Write and run a failing config test**

Append to `tests/config.test.ts`:

```typescript
test("parseConfig accepts a tool with a compute handler", () => {
  const yaml = `
server: { name: c, version: "0.1.0" }
tools:
  - name: now
    description: current time
    handler:
      compute: { "time.now": [] }
`;
  const config = parseConfig(yaml);
  const handler = config.tools[0]!.handler;
  assert.ok("compute" in handler);
  assert.deepEqual(handler.compute, { "time.now": [] });
});
```

Run: `npm test`
Expected: the config test passes. (Compute handler tests from Task 3.2 still fail — they need the implementation in Task 3.4.)

### Task 3.4: Implement `invokeCompute`

**Files:**
- Create: `src/runtime/handlers/compute.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { ComputeHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { evaluate } from "../util/jsonlogic.ts";

/**
 * Pure JSONLogic handler. Evaluates the compute rule against the tool
 * call args and returns the result as text content.
 *
 * Purity: the handler reads no state outside what the engine provides.
 * Helpers may inspect the filesystem, env, paths, OS, and time (per
 * ADR-0008), but the handler itself performs no I/O. Side-effect work
 * lives in exec:; network work is Plan 4.
 *
 * Result encoding:
 *   - Strings pass through verbatim.
 *   - Numbers, booleans, null → String(value).
 *   - Objects and arrays → JSON.stringify (so clients can parse them).
 *
 * Engine errors (unknown operator, malformed rule) become isError
 * results with a "compute:" prefix. They are tool-call failures, not
 * JSON-RPC protocol errors.
 */
export async function invokeCompute(
  handler: ComputeHandler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  try {
    const value = await evaluate(handler.compute, args);
    return { content: [{ type: "text", text: stringify(value) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `compute: ${message}` }],
      isError: true,
    };
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
```

- [ ] **Step 2: Run tests; verify the GREEN for compute**

Run: `npm test`
Expected: compute handler tests pass. The typecheck gate still fails — that's fixed in Task 3.5.

### Task 3.5: Wire compute into the central `invoke`

**Files:**
- Modify: `src/runtime/handlers/index.ts`

- [ ] **Step 1: Add the compute arm**

Replace the body of `invoke` in `src/runtime/handlers/index.ts`:

```typescript
import type { Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";
import { invokeCompute } from "./compute.ts";

/**
 * Route a resolved Handler to the matching handler implementation.
 *
 * The function passed down to `invokeDispatch` is `invoke` itself, which
 * is what lets a dispatcher's sub-handler be another dispatcher,
 * another exec, a compute, or an inline — the invocation tree is
 * type-agnostic at this seam.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) return invokeDispatch(handler, args, invoke);
  if ("compute" in handler) return invokeCompute(handler, args);
  // Exhaustive type narrowing; adding a new Handler variant without a
  // new arm here becomes a compile error at this line.
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
```

- [ ] **Step 2: Run all gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch`
Expected: clean everywhere. Compute tests pass, typecheck clean, both smoke targets still green.

### Task 3.6: Commit Phase 3

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): compute handler (pure JSONLogic evaluation)

Adds src/runtime/handlers/compute.ts — a pure handler that runs its
JSONLogic rule through util/jsonlogic.ts's evaluate() against the
tool call args. Strings pass through verbatim; primitives stringify;
objects/arrays JSON-stringify. Engine errors (unknown operator,
malformed rule) surface as isError tool results with a "compute:"
prefix, not JSON-RPC errors.

Widens the Handler union to include ComputeHandler; validateHandler
recognizes a `compute:` key and carries the rule through unchanged.
Adds the compute arm to invoke() in handlers/index.ts and preserves
the exhaustive never narrowing so future handler types stay covered.

Compute handlers can use the 16 helpers from Phase 2: a tool like
{"compute": {"env.get": ["HOME"]}} returns $HOME as text content.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 4: `when:` guards on dispatch cases

**Intent:** Extend `DispatchCase` with an optional `when:` JSONLogic rule. Evaluate the guard before `requires:` is checked; failing guards produce an isError tool result naming the action. `when` and `requires` compose as AND — both must pass for the case to fire.

**Branch:** `feat/plan3-guards`

### Task 4.1: Extend `DispatchCase` with `when?`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add `when?` to the interface**

Update `DispatchCase`:

```typescript
export interface DispatchCase {
  requires?: string[];
  when?: JsonLogicRule;
  handler: Handler;
}
```

(`JsonLogicRule` should already be imported from the compute work in Phase 3; if not, add the import.)

### Task 4.2: Extend `validateDispatch` to carry `when:`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the when-parsing branch**

Inside `validateDispatch`'s per-case loop, after the `requires` validation and before the `cases[name] = ...` line, add:

```typescript
const when = e["when"];
// when: is arbitrary JSONLogic — no structural validation at parse
// time. Engine errors at evaluation time become isError tool results.
const whenValue: JsonLogicRule | undefined = when === undefined ? undefined : when;
```

Update the case assignment so it carries through:

```typescript
const caseValue: DispatchCase = { handler: subHandler };
if (requiresValue !== undefined) caseValue.requires = requiresValue;
if (whenValue !== undefined) caseValue.when = whenValue;
cases[name] = caseValue;
```

Replace the previous inline ternary that built the case — the new form handles three shapes (bare, with requires, with when, with both) without combinatorial branches.

### Task 4.3: Write failing tests for `invokeDispatch` with `when:`

**Files:**
- Modify: `tests/handlers.test.ts` (append)

- [ ] **Step 1: Append the tests**

```typescript
test("invokeDispatch with when: truthy runs the case handler", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [1, 1] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "went");
});

test("invokeDispatch with when: falsy returns isError naming the action", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [1, 2] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /guard.*go/i);
});

test("invokeDispatch with when: referencing args", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [{ var: "flag" }, true] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const pass = await invokeDispatch(guarded, { action: "go", flag: true }, testInvoke);
  assert.equal(pass.isError, undefined);
  const block = await invokeDispatch(guarded, { action: "go", flag: false }, testInvoke);
  assert.equal(block.isError, true);
});

test("invokeDispatch with when: AND requires: — both must pass", async () => {
  const both: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          requires: ["id"],
          when: { "==": [{ var: "flag" }, true] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  // Both pass
  const ok = await invokeDispatch(
    both,
    { action: "go", id: "x", flag: true },
    testInvoke,
  );
  assert.equal(ok.isError, undefined);
  // when fails — report guard failure (when is checked before requires)
  const whenFail = await invokeDispatch(
    both,
    { action: "go", id: "x", flag: false },
    testInvoke,
  );
  assert.equal(whenFail.isError, true);
  assert.match(whenFail.content[0]!.text, /guard/i);
  // when passes, requires fails
  const requiresFail = await invokeDispatch(
    both,
    { action: "go", flag: true },
    testInvoke,
  );
  assert.equal(requiresFail.isError, true);
  assert.match(requiresFail.content[0]!.text, /id.*required.*go/i);
});

test("invokeDispatch with when: engine error returns isError", async () => {
  const broken: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          // Unknown operator — engine throws at evaluate time.
          when: { unknownOperator: [1, 2] } as unknown,
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(broken, { action: "go" }, testInvoke);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /guard.*go/i);
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL — `invokeDispatch` currently ignores `when:`.

### Task 4.4: Implement `when:` evaluation in `invokeDispatch`

**Files:**
- Modify: `src/runtime/handlers/dispatch.ts`

- [ ] **Step 1: Import `evaluate`**

Add to the imports at the top of `src/runtime/handlers/dispatch.ts`:

```typescript
import { evaluate } from "../util/jsonlogic.ts";
```

- [ ] **Step 2: Insert the guard check before `requires`**

Inside `invokeDispatch`, after the `matched = cases[actionValue]` check and BEFORE the `requires` block, add:

```typescript
if (matched.when !== undefined) {
  let guardPassed: boolean;
  try {
    const raw = await evaluate(matched.when, args);
    guardPassed = Boolean(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(
      `dispatch: guard for action "${actionValue}" errored: ${message}`,
    );
  }
  if (!guardPassed) {
    return errorResult(
      `dispatch: guard for action "${actionValue}" did not pass`,
    );
  }
}
```

Order matters: **when** is evaluated first, then **requires**. Rationale: `when:` is the broader gate (whole-environment conditions like "only on macOS"), `requires:` is per-field input validation. Checking environmental feasibility before input shape matches what authors intuit when writing "this case only applies if X."

- [ ] **Step 3: Run tests; verify the GREEN**

Run: `npm test`
Expected: all guard tests pass; existing dispatch tests still pass.

- [ ] **Step 4: Typecheck + smoke gates**

Run: `npm run check && just smoke && just smoke-dispatch`
Expected: clean.

### Task 4.5: Commit Phase 4

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): when: guards on dispatch cases (JSONLogic + helpers)

Adds optional when: field on DispatchCase. Guards are evaluated before
per-case requires: validation — when checks whole-environment
feasibility ("only on macOS", "only when HOME is set"), requires
checks per-field input shape. Both must pass for the case to fire
(AND composition).

A failing guard produces isError with message "dispatch: guard for
action X did not pass". An engine error during guard evaluation
(unknown operator, malformed rule) also surfaces as isError with the
underlying message, never as a JSON-RPC protocol error.

validateDispatch carries when: through unchanged — any valid JSONLogic
rule, no structural validation at parse time. Guards gain expressive
power through the 16 helpers from Phase 2: file.exists, env.has,
os.platform, etc.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 5: Tool-level `transform:` response reshaping

**Intent:** Add optional `transform:` at the tool definition level. When present, the handler's result gets reshaped by running the JSONLogic rule against `{ result, args }` and replacing the content text with the evaluation result. Tool-level placement (not case-level, not handler-level) keeps v1 simple: one transform per tool, applied uniformly.

**Branch:** `feat/plan3-transform`

### Task 5.1: Extend `ToolDefinition` with `transform?`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the field**

Update `ToolDefinition` (or whatever the interface is called in `config.ts`):

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  input?: Record<string, InputField>;
  handler: Handler;
  transform?: JsonLogicRule;
}
```

(Signature of `InputField` and other existing members unchanged.)

### Task 5.2: Extend tool validation to carry `transform`

**Files:**
- Modify: `src/runtime/config.ts`
- Modify: `tests/config.test.ts` (append)

- [ ] **Step 1: Write a failing config test**

Append to `tests/config.test.ts`:

```typescript
test("parseConfig accepts a tool with a transform", () => {
  const yaml = `
server: { name: t, version: "0.1.0" }
tools:
  - name: wrap
    description: demo
    handler:
      inline: { text: "raw" }
    transform:
      cat: ["wrapped(", { var: "result" }, ")"]
`;
  const config = parseConfig(yaml);
  const tool = config.tools[0]!;
  assert.ok(tool.transform);
  assert.deepEqual(tool.transform, {
    cat: ["wrapped(", { var: "result" }, ")"],
  });
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL — `parseConfig` drops the transform field because `validateTool` doesn't carry it through.

- [ ] **Step 3: Carry `transform` through `validateTool`**

Find the function in `src/runtime/config.ts` that builds a `ToolDefinition` from raw YAML (likely `validateTool` or inline inside `parseConfig`). Add after the handler is validated:

```typescript
const transform = rawTool["transform"];
if (transform !== undefined) {
  toolValue.transform = transform as JsonLogicRule;
}
```

No structural validation of the transform rule — any valid JSONLogic is accepted. Engine errors at invocation time become isError tool results.

- [ ] **Step 4: Run the config test; verify GREEN**

Run: `npm test`
Expected: the config test passes.

### Task 5.3: Write failing tests for transform application

**Files:**
- Modify: `tests/handlers.test.ts` or create `tests/transform.test.ts`

For cohesion with the other handler tests, append to `tests/handlers.test.ts`. The transform application logic will live in `src/runtime/index.ts` (where the handler result is assembled), so the test calls a small helper `applyTransform(result, args, rule)` exported from there. If that export is awkward, extract `applyTransform` into `src/runtime/util/transform.ts` and test it there.

- [ ] **Step 1: Append the tests**

Add to `tests/handlers.test.ts`:

```typescript
import { applyTransform } from "../src/runtime/util/transform.ts";

test("applyTransform reshapes handler text using {result, args}", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "raw" }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    { who: "Ada" } as Record<string, unknown>,
    { cat: [{ var: "result" }, " / greeting for ", { var: "args.who" }] },
  );
  assert.equal(reshaped.isError, undefined);
  assert.equal(reshaped.content[0]!.text, "raw / greeting for Ada");
});

test("applyTransform parses JSON result before reshaping when possible", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: '{"n":41}' }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    { "+": [{ var: "result.n" }, 1] },
  );
  assert.equal(reshaped.isError, undefined);
  assert.equal(reshaped.content[0]!.text, "42");
});

test("applyTransform passes isError results through without reshaping", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "exec: ENOENT" }],
    isError: true,
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    { cat: ["should not be applied"] },
  );
  assert.equal(reshaped.isError, true);
  assert.equal(reshaped.content[0]!.text, "exec: ENOENT");
});

test("applyTransform returns isError when the engine throws", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "ok" }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    { unknownOperator: [] } as unknown,
  );
  assert.equal(reshaped.isError, true);
  assert.match(reshaped.content[0]!.text, /transform:/i);
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/util/transform.ts'`.

### Task 5.4: Implement `applyTransform`

**Files:**
- Create: `src/runtime/util/transform.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { ToolCallResult } from "../handlers/types.ts";
import { evaluate, type JsonLogicRule } from "./jsonlogic.ts";

/**
 * Tool-level response reshaping.
 *
 * Called by `src/runtime/index.ts` after `invoke(handler, args)`
 * returns. Reshapes successful handler results against a JSONLogic
 * rule evaluated over `{ result, args }`.
 *
 *   result: the handler's text content, JSON-parsed when possible and
 *           left as a string otherwise
 *   args:   the original tool call arguments
 *
 * isError results pass through unchanged — transforms are a happy-path
 * reshape. An engine error during transform evaluation becomes a new
 * isError with a "transform:" prefix.
 *
 * Encoding on output matches invokeCompute's rules: strings pass
 * through, primitives stringify, objects JSON-stringify.
 */
export async function applyTransform(
  result: ToolCallResult,
  args: Record<string, unknown>,
  rule: JsonLogicRule,
): Promise<ToolCallResult> {
  if (result.isError) return result;

  const rawText = result.content[0]?.text ?? "";
  const parsedResult = tryParseJson(rawText);

  try {
    const reshaped = await evaluate(rule, {
      result: parsedResult,
      args,
    });
    return { content: [{ type: "text", text: stringify(reshaped) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `transform: ${message}` }],
      isError: true,
    };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
```

- [ ] **Step 2: Run tests; verify GREEN**

Run: `npm test`
Expected: transform tests pass.

### Task 5.5: Apply `transform` in the registration loop

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Wrap the handler call**

Inside `src/runtime/index.ts`'s tool registration loop, modify the handler closure to apply the tool's transform when present:

```typescript
import { applyTransform } from "./util/transform.ts";

// ... inside main(), replacing the existing registration loop:

for (const tool of config.tools) {
  const handler: ToolHandler = async (args: unknown) => {
    const normalized = normalizeArgs(args);
    const raw = await invoke(tool.handler, normalized);
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

- [ ] **Step 2: Run all gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch`
Expected: clean.

### Task 5.6: Commit Phase 5

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): tool-level transform: response reshaping (JSONLogic)

Adds optional transform: field on ToolDefinition. When present, the
handler's result is reshaped by evaluating the JSONLogic rule against
{ result, args } — where result is the parsed JSON of the handler
output (or the raw string when not JSON) and args are the original
tool call arguments.

Lives at the tool level only — one transform per tool, applied
uniformly. Case-level and handler-level transforms are explicitly out
of scope for v1; authors needing per-case shapes pre-shape inside the
handler.

applyTransform() is a small pure function in util/transform.ts:
isError results pass through unchanged, engine errors become new
isError results with a "transform:" prefix. index.ts wraps the
handler call so the transform applies uniformly across the four
handler types (inline, exec, dispatch, compute).
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 6: Example, smoke, handoff

**Intent:** Add `examples/compute-and-guards.yaml` — a multi-action tool that exercises compute, when-guards-with-helpers, and a transform end-to-end. Add a `just smoke-compute` recipe. Add an integration test that round-trips the full chain over stdio. Write the public handoff for Plan 4.

**Branch:** `feat/plan3-complete`

### Task 6.1: Write `examples/compute-and-guards.yaml`

**Files:**
- Create: `examples/compute-and-guards.yaml`

- [ ] **Step 1: Write the file**

```yaml
# A Plan 3 example that exercises compute, when: guards, helpers,
# and tool-level transform together.
#
# The helpers (per ADR-0008) show up in realistic places:
#   - os.platform + os.arch in a compute that returns host info
#   - env.has + env.get in a guarded case (token_echo)
#   - file.is_dir + path.join + env.get composed in a home_config guard
#   - os.platform in a simple platform_only guard
#
# A tool-level transform wraps the raw handler output in a standard
# envelope so callers get a uniform shape across actions.

server:
  name: jig-plan3-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 3: compute handlers, when guards with helpers,
    tool-level transform. This is the Plan 3 smoke target.

tools:
  - name: envcheck
    description: |
      Environment / platform introspection. Actions:
        summary              → compute: host info as JSON
        platform_only        → inline, gated on os.platform == darwin
        home_config          → inline, gated on $HOME/.config being a dir
        token_echo           → requires [var]; returns env.get(var) when env.has(var)

      Every response is wrapped as {"action": <action>, "value": <raw>}
      by the tool-level transform.

    input:
      action:
        type: string
        required: true
        description: Which action to run
      var:
        type: string
        description: Env var name (required for token_echo)

    handler:
      dispatch:
        on: action
        cases:
          summary:
            handler:
              compute:
                cat:
                  - "platform="
                  - { "os.platform": [] }
                  - " arch="
                  - { "os.arch": [] }
                  - " now="
                  - { "time.now": [] }

          platform_only:
            when: { "==": [{ "os.platform": [] }, "darwin"] }
            handler:
              inline:
                text: "Running on macOS"

          home_config:
            when:
              and:
                - { "env.has": ["HOME"] }
                - { "file.is_dir": [{ "path.join": [{ "env.get": ["HOME"] }, ".config"] }] }
            handler:
              inline:
                text: "$HOME/.config is a directory"

          token_echo:
            requires: [var]
            when: { "env.has": [{ "var": "var" }] }
            handler:
              compute: { "env.get": [{ "var": "var" }] }

    transform:
      cat:
        - "["
        - { "var": "args.action" }
        - "] "
        - { "var": "result" }
```

The transform builds a plain-string envelope: `[<action>] <raw result>`. This composes args (which action was invoked) with result (what the handler returned) without requiring a JSON-escape operator that `json-logic-engine` doesn't ship by default. Authors who need structured-JSON wrapping build it in the handler (return a JSON-stringified object) rather than the transform; a dedicated `json.object` operator is a candidate for a future plan.

### Task 6.2: Add `just smoke-compute`

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Add the recipe**

Append to `justfile`:

```just
# Smoke-compute: exercise the compute + guard + transform example. Sends
# initialize + tools/call for summary, platform_only, and token_echo.
# Verifies each returns the expected shape and that transform wraps
# them.
smoke-compute:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"envcheck","arguments":{"action":"summary"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"envcheck","arguments":{"action":"token_echo","var":"HOME"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/compute-and-guards.yaml)
    if [ -z "$output" ]; then
      echo "smoke-compute: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -2 | jq .
```

- [ ] **Step 2: Run it**

Run: `just smoke-compute`
Expected: two JSON-RPC response objects printed via jq. The first (`summary`) has `content[0].text` starting with `[summary] platform=…`. The second (`token_echo`) has `content[0].text` starting with `[token_echo] /Users/…` (since HOME is set on any dev machine).

### Task 6.3: Integration test — compute + guards + transform round-trip

**Files:**
- Modify: `tests/integration.test.ts` (append)

- [ ] **Step 1: Append the test**

```typescript
test(
  "compute + when guards + transform round-trip over stdio",
  { timeout: 10_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-plan3-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server: { name: plan3-int, version: "0.0.1" }
tools:
  - name: envcheck
    description: x
    input:
      action: { type: string, required: true }
    handler:
      dispatch:
        on: action
        cases:
          platform:
            handler:
              compute: { "os.platform": [] }
          macos_only:
            when: { "==": [{ "os.platform": [] }, "${process.platform}"] }
            handler:
              inline: { text: "gated pass" }
          never_match:
            when: { "==": [1, 2] }
            handler:
              inline: { text: "should not run" }
    transform:
      cat: ["wrap(", { var: "result" }, ")"]
`,
    );
    try {
      // Match responses by id: async handlers can complete out of
      // request order over stdio (landmine from Plan 2 handoff).
      const rpcResponses = await sendRpc(
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
            params: { name: "envcheck", arguments: { action: "platform" } },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "envcheck", arguments: { action: "macos_only" } },
          },
          {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "envcheck", arguments: { action: "never_match" } },
          },
        ],
      );

      const byId = new Map<number, (typeof rpcResponses)[number]>();
      for (const r of rpcResponses) byId.set(r.id as number, r);

      const platform = byId.get(2)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(platform.isError, undefined);
      assert.match(platform.content[0]!.text, /^wrap\(.+\)$/);

      const gated = byId.get(3)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(gated.isError, undefined);
      assert.match(gated.content[0]!.text, /wrap\(gated pass\)/);

      const blocked = byId.get(4)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(blocked.isError, true);
      assert.match(blocked.content[0]!.text, /guard.*never_match/i);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);
```

Note: the YAML uses `${process.platform}` to inject the current platform at test-build time — resolve that template with actual `process.platform` before writing. Adjust the `writeFileSync` call:

```typescript
    writeFileSync(
      configPath,
      `server: { name: plan3-int, version: "0.0.1" }
tools:
  - name: envcheck
    description: x
    input:
      action: { type: string, required: true }
    handler:
      dispatch:
        on: action
        cases:
          platform:
            handler:
              compute: { "os.platform": [] }
          macos_only:
            when: { "==": [{ "os.platform": [] }, "${process.platform}"] }
            handler:
              inline: { text: "gated pass" }
          never_match:
            when: { "==": [1, 2] }
            handler:
              inline: { text: "should not run" }
    transform:
      cat: ["wrap(", { var: "result" }, ")"]
`.replace("${process.platform}", process.platform),
    );
```

- [ ] **Step 2: Run all gates**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute`
Expected: clean across all five gates.

### Task 6.4: Write the Plan 3 complete handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan3-complete.md` (use the actual date and Eastern time — `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Invoke the `building-in-the-open:curating-context` skill**

Follow the skill's public-mode flow: Context Curator persona, four required sections (Where things stand / Decisions made / What's next / Landmines), under 2,000 tokens per the bito gate.

Content should cover:

- **State:** Green, Plan 3 runtime passing all tests and three smoke recipes (`smoke`, `smoke-dispatch`, `smoke-compute`).
- **What changed:** All six Plan 3 phases with commit references. The new surface: `json-logic-engine` v5 wrapper, 16 helpers across file/env/path/os/time, `compute:` handler, `when:` guards on dispatch, tool-level `transform:`. ADR-0008 now fully implemented.
- **What's next:** Plan 4 — `connections:` block, `probes:`, `http` / `graphql` handlers. Where probes fit in the engine lifecycle (startup-time helper invocations? separate `{{probe.NAME}}` surface?) will be an early Plan 4 design call. Related: ADR on `connections:` schema and credential resolution.
- **Landmines:** likely candidates based on implementation —
  - `json-logic-engine` treats missing vars as `null`; guards that test `{"var":"x"}` truthy pass for any non-empty/non-zero value. Authors expecting "variable was set" semantics should use `env.has` style helpers.
  - Transform parses result as JSON — handler outputs that happen to look like numbers (`"42"`) become numbers in the transform context. Surprising if unexpected; the `tryParseJson` fallback in `applyTransform` is intentional.
  - `when:` and `requires:` both compose as AND. If a case adds both, failing either produces distinct error messages ("guard did not pass" vs "field required"). Don't conflate them.
  - The engine singleton at `util/jsonlogic.ts` is mutated by `util/helpers.ts` at import time. Tests that touch the engine must import helpers for registration to happen (integration tests do this transitively via `src/runtime/index.ts`).
  - Helpers resolve relative paths against the *runtime* directory, not the server.mjs directory (those match in dev; diverge post-build). Plan 7 (build pipeline) should verify the distinction survives esbuild.
  - `compute` output stringification: object results JSON-stringify. Authors who want pretty-printed JSON need to handle it in the handler, not the transform.

### Task 6.5: Commit Phase 6

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): plan 3 example, smoke-compute, handoff

Adds examples/compute-and-guards.yaml — a four-action tool that
exercises the full Plan 3 surface: compute handlers, when guards
composed with helpers (os.platform, env.has, path.join, file.is_dir),
AND composition with requires, and a tool-level transform that wraps
every response in a JSON envelope.

Adds `just smoke-compute` — initialize + two tools/call (summary,
token_echo), verifies transform-wrapped output lands on stdout.

Adds an integration test that round-trips compute + guard-pass +
guard-fail + transform over stdio, matching responses by id (not
array position) per the Plan 2 handoff landmine.

Lands the Plan 3 complete handoff under .handoffs/, naming Plan 4
(connections / probes / http / graphql) as the next plan.

Plan 3 is complete with this commit: json-logic-engine v5 wired up,
16 built-in helpers per ADR-0008, compute / when / transform, example
+ smoke + integration coverage.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Self-Review Checklist (run this once, at drafting time)

- [x] **Spec coverage.** ADR-0008's 16 helpers across 5 namespaces all land in Phase 2. Design doc §"Templating: two layers" (JSONLogic for guards, transforms, compute handlers) is covered by Phases 1, 3, 4, 5. The scope note carves out Plan 4+ work (connections, probes, http, graphql) and Plan 5+ work (state-machine transitions, etc.).
- [x] **Placeholder scan.** No "TBD" / "handle edge cases" / "similar to Task N" entries. Every code block is complete.
- [x] **Type consistency.** `JsonLogicRule` exported from `util/jsonlogic.ts` is the single source; `ComputeHandler` / `DispatchCase.when` / `ToolDefinition.transform` all reference it. The `Handler` union grows by one variant (Phase 3) and the exhaustive `never` check guides wiring. `ToolCallResult` is unchanged from Plan 2.
- [x] **Phase independence.** Each phase lands as its own PR on `main`. Phase 2's side-effect import in `index.ts` is additive; Phase 3's new `invoke` arm makes the typecheck red-green transition explicit. Phases 4 and 5 are independent additions.
- [x] **Smoke coverage.** Plan 2's smokes (`smoke`, `smoke-dispatch`) remain green through every phase. Plan 3 adds `smoke-compute` in Phase 6.
- [x] **ADR alignment.** ADR-0008 (helpers) is implemented in Phase 2. No new ADRs required for Plan 3 — the decisions (tool-level transform, when+requires AND composition, helper semantics) are recorded inline in this plan and in ADR-0008.
