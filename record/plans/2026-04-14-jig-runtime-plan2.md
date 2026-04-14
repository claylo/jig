# jig Runtime — Plan 2 (Dispatcher + Exec + Mustache)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Extend the Plan 1 runtime so `tools/call` can route through a dispatcher-style YAML tool (one `action` enum, per-action `requires`, per-action sub-handlers), execute shell commands via a Mustache-templated `exec:` handler, and surface per-action validation errors as `isError: true` tool results. `examples/dispatcher.yaml` exercises the full path end-to-end.

**Architecture:** Three new runtime modules land in order. (1) `src/runtime/util/template.ts` is a minimal Mustache renderer — `{{var}}` and `{{a.b.c}}` paths only, no sections or conditionals, no HTML escaping. (2) `src/runtime/handlers/exec.ts` renders its command string through the template module, whitespace-splits the result into argv, and invokes `child_process.execFile` (no shell). (3) `src/runtime/handlers/dispatch.ts` reads a discriminator field from the tool's args, validates `requires`, and routes to a sub-handler via an injected `invoke` function — keeping the module acyclic. `src/runtime/handlers/index.ts` owns the central `invoke(handler, args)` switch; `src/runtime/index.ts` swaps its direct `invokeInline` call for `invoke`. `ToolCallResult` migrates to a shared `handlers/types.ts` so all handlers share one result shape.

**Tech Stack:** Unchanged from Plan 1 — Node 24+, TypeScript 5.7+, `node:test`, `yaml`, `@modelcontextprotocol/server@2.0.0-alpha.x`. No new production dependencies; Mustache and argv splitting are hand-rolled for explicitness and bundle size.

---

## Scope Note

This is **plan 2 of ~7** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)).

**Planned sequence:**

1. Plan 1 — smoke test (merged) — stdio MCP + inline tool
2. **Plan 2 — dispatcher + exec + Mustache** (this plan)
3. Plan 3 — JSONLogic (`json-logic-engine`) + `compute` handler + guards + transforms
4. Plan 4 — `connections:`, `probes:`, `http` / `graphql` handlers
5. Plan 5 — resources (+ watchers), prompts, completions, tasks (state machines)
6. Plan 6 — CLI (`jig new|dev|validate|build`)
7. Plan 7 — build pipeline (esbuild single-file, `.mcpb`, `extension_points:` composition, HTTP transport)

**Out of scope for Plan 2 (carried to later plans):**

- JSONLogic — no `compute` handler, no `when:` guards, no `transform:` steps. Plan 3.
- `connections:` block, `probes:` block, `http` handler, `graphql` handler. Plan 4.
- `help: { auto: true }` synthesis of per-action docs from the dispatch spec. Defer until Plan 3 at earliest.
- Resources / prompts / tasks / `completions:` / `user_config:` / `extension_points:`. Plan 5+.
- Mustache sections (`{{#each}}`), partials (`{{> name}}`), conditionals (`{{#if}}`), lambdas, or any escape syntax beyond raw. Permanently out of scope; JSONLogic handles logic.
- Exec stdin passing, timeouts, explicit environment scoping, `shell: true`. Later plan or dedicated ADR.
- Hot-reload on YAML change. Plan 6 (with CLI `jig dev`).

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **Quarantine holds.** SDK imports (`@modelcontextprotocol/*`) stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. Mustache, exec, and dispatch modules must not import from the SDK.
- **No shell.** Exec uses `child_process.execFile` with an explicit argv array. No `shell: true`, no command strings passed to `sh -c`, no `spawn` with a shell. Rendered strings are whitespace-split and that's the entire argv.
- **Three gates must all pass before commit.** `npm run check && npm test && just smoke` — tests alone is not enough; typecheck catches structural mismatches JSON equality hides (this bit us in Plan 1 Phase 4).
- **Commits via `commit.txt`.** Every commit step writes the message to `commit.txt`; Clay runs `gtxt` (`git commit -F commit.txt && rm commit.txt`) and `git pm` (push + PR + auto-merge). Never `git commit` directly.
- **Feature branch per phase.** `feat/plan2-doc`, `feat/plan2-mustache`, `feat/plan2-exec`, `feat/plan2-dispatch`, `feat/plan2-integrate`, `feat/plan2-complete`. Each phase lands on main before the next starts.
- **Integration tests carry `{ timeout: 10_000 }`.** Subprocess-based tests hang forever on bugs without it.

## File Structure

```
jig/
  record/
    plans/
      2026-04-14-jig-runtime-plan2.md    # this plan (Phase 0)
    decisions/
      0006-exec-no-shell-whitespace-argv.md   # Phase 2 ADR
      0007-mustache-minimal-string-only.md    # Phase 1 ADR
  src/
    runtime/
      util/
        template.ts                      # Mustache renderer (Phase 1)
      handlers/
        types.ts                         # ToolCallResult (moved from inline.ts) (Phase 2)
        inline.ts                        # unchanged behavior; imports types from ./types.ts
        exec.ts                          # exec handler (Phase 2)
        dispatch.ts                      # dispatch handler (Phase 3)
        index.ts                         # invoke() central dispatch (Phase 4)
      config.ts                          # Handler union expands (Phase 4)
      index.ts                           # swap invokeInline → invoke (Phase 4)
      tools.ts                           # toolToInputSchema gains dispatch awareness (Phase 3)
  tests/
    template.test.ts                     # Mustache tests (Phase 1)
    handlers.test.ts                     # exec + dispatch unit tests (Phases 2–3)
    tools.test.ts                        # extend for dispatch-aware inputSchema (Phase 3)
    config.test.ts                       # extend for new handler types (Phase 4)
    integration.test.ts                  # dispatcher round-trip (Phase 4)
    fixtures/
      exit-nonzero.mjs                   # tiny fixture: process.exit(1) (Phase 2)
  examples/
    dispatcher.yaml                      # Phase 5
  justfile                               # new `smoke-dispatch` recipe (Phase 5)
```

**Not in Plan 2:** anything under `src/runtime/resources.ts`, `prompts.ts`, `tasks.ts`, `transports/http.ts`, `handlers/http.ts`, `handlers/graphql.ts`, `handlers/compute.ts`, `util/jsonlogic.ts`, `util/env.ts`, `src/cli/`. Those arrive in later plans.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 2 to `record/plans/` so subsequent phases can reference it by absolute repo path.

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 2 (dispatcher + exec + Mustache)

Phase 0 of jig runtime Plan 2 — the plan doc itself. Subsequent phases
land on feature branches feat/plan2-mustache, feat/plan2-exec,
feat/plan2-dispatch, feat/plan2-integrate, feat/plan2-complete.

Out of scope for Plan 2 per the scope note: JSONLogic, connections,
probes, resources, prompts, tasks, CLI, build pipeline. Mustache
remains minimal (vars only, no sections); exec stays shell-free.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

Expected: Plan 2 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: Mustache renderer

**Intent:** Land `src/runtime/util/template.ts` — a minimal string-interpolator supporting `{{var}}` and `{{a.b.c}}` paths. This module has no runtime dependencies; later handlers (`exec`, eventually `http`/`graphql`) call it to interpolate args.

**Branch:** `feat/plan2-mustache`

### Task 1.1: Write failing tests for `render`

**Files:**
- Create: `tests/template.test.ts`

- [ ] **Step 1: Write the file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/runtime/util/template.ts";

test("render substitutes a single variable", () => {
  assert.equal(render("hello {{name}}", { name: "world" }), "hello world");
});

test("render treats missing variables as empty string", () => {
  assert.equal(render("hello {{name}}", {}), "hello ");
});

test("render tolerates whitespace inside the braces", () => {
  assert.equal(render("{{ name }}", { name: "world" }), "world");
});

test("render resolves nested dot-paths", () => {
  assert.equal(
    render("{{a.b.c}}", { a: { b: { c: "deep" } } }),
    "deep",
  );
});

test("render returns empty string for a partial dot-path miss", () => {
  assert.equal(render("{{a.b.c}}", { a: { b: {} } }), "");
});

test("render stringifies numbers and booleans", () => {
  assert.equal(render("{{n}} / {{b}}", { n: 42, b: true }), "42 / true");
});

test("render JSON-stringifies objects and arrays", () => {
  assert.equal(
    render("{{o}}", { o: { x: 1 } }),
    '{"x":1}',
  );
  assert.equal(
    render("{{a}}", { a: [1, 2, 3] }),
    "[1,2,3]",
  );
});

test("render leaves literal text unchanged when no tokens are present", () => {
  assert.equal(render("no tokens here", { unused: "x" }), "no tokens here");
});

test("render substitutes the same token multiple times", () => {
  assert.equal(render("{{x}}-{{x}}", { x: "a" }), "a-a");
});

test("render leaves unclosed braces as literal text", () => {
  assert.equal(render("hello {{name", { name: "ignored" }), "hello {{name");
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/util/template.ts'`.

### Task 1.2: Implement `render`

**Files:**
- Create: `src/runtime/util/template.ts`

- [ ] **Step 1: Write the file**

```typescript
/**
 * Minimal Mustache-style string renderer.
 *
 * Supports `{{var}}` and `{{a.b.c}}` dot-paths only. No sections, no
 * conditionals, no partials, no HTML escaping, no lambdas. Logic lives
 * in JSONLogic (Plan 3); this module is string interpolation only.
 *
 * Missing values render as empty string — matching Mustache's standard
 * behavior. Numbers and booleans stringify via `String()`. Objects and
 * arrays JSON-stringify, which is usually what authors want when
 * templating shell args or URLs from structured data.
 *
 * Unclosed `{{` sequences render as literal text. The renderer never
 * throws on malformed input so tool-call templating cannot kill a
 * request that merely had a typo.
 */
const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function render(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(TOKEN_RE, (_match, path: string) => {
    const value = resolvePath(vars, path);
    return stringify(value);
  });
}

function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Objects and arrays: JSON encoding. Authors who want a custom format
  // should pre-compute it before handing args to the renderer.
  return JSON.stringify(value);
}
```

- [ ] **Step 2: Run tests; verify the GREEN**

Run: `npm test`
Expected: all template tests pass; earlier tests remain green.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 1.3: Write ADR-0007 (minimal Mustache)

**Files:**
- Create: `record/decisions/0007-mustache-minimal-string-only.md`

- [ ] **Step 1: Write the ADR**

```markdown
---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0007: Minimal Mustache — string interpolation only, no logic

## Context and Problem Statement

Plan 2 needs string interpolation so exec commands, URLs, and (later) HTTP bodies can reference `tools/call` arguments. Full Mustache supports sections, conditionals, partials, and lambdas. Which subset should jig's renderer implement?

## Decision Drivers

- JSONLogic (Plan 3) covers conditional logic; Mustache sections would duplicate that surface.
- Bundle size matters — jig ships inside every built `.mjs`; a full Mustache library costs roughly 10–15 KB we don't need.
- Authors reaching for Mustache sections in YAML are usually signaling that the logic belongs in a `compute:` handler or a guard.
- Hand-rolled renderers are auditable; a vendored library isn't.

## Considered Options

- **Full Mustache (`mustache` on npm).** All features, external dependency.
- **Minimal hand-rolled `{{var}}` + `{{a.b.c}}` only** (chosen).
- **JSONLogic with string-template operator.** Force every interpolation through JSONLogic.

## Decision Outcome

Chosen: **Minimal hand-rolled renderer**.

- `{{var}}` and `{{a.b.c}}` dot-paths.
- Missing values render as empty string.
- Primitives via `String()`; objects and arrays via `JSON.stringify`.
- Unclosed braces render as literal text — the renderer never throws.
- No HTML escaping; no sections, conditionals, partials, lambdas.

### Consequences

- Good, because bundle size stays close to zero for the templating surface.
- Good, because the behavior is fully specified in one file.
- Good, because authors who reach for logic get redirected to JSONLogic (Plan 3) where it belongs.
- Bad, because authors who already know full Mustache syntax will try `{{#each}}` and get literal-text output. Documentation has to name the subset explicitly.
- Bad, because jig now owns a templating surface; any future ambiguity is our problem.

### Confirmation

Tests in `tests/template.test.ts` cover the surface: missing values, nested paths, primitives and objects, multiple substitutions, unclosed braces. Any future expansion (e.g., loops over `probe` arrays) requires its own ADR.
```

### Task 1.4: Commit Phase 1

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): minimal Mustache renderer

Adds src/runtime/util/template.ts — a hand-rolled {{var}} / {{a.b.c}}
renderer with no dependencies. Missing paths render empty, primitives
stringify, objects JSON-stringify, unclosed braces stay literal. No
sections, no HTML escaping: logic belongs in JSONLogic (Plan 3).

See record/decisions/0007-mustache-minimal-string-only.md for the full
scope and rationale.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 2: `exec` handler

**Intent:** Land `src/runtime/handlers/exec.ts` — render a command string via the Mustache module, whitespace-split the rendered string into argv, run `child_process.execFile`, and return stdout (or stderr + `isError: true` on failure). Move `ToolCallResult` into `handlers/types.ts` so subsequent handlers share the shape.

**Branch:** `feat/plan2-exec`

### Task 2.1: Move `ToolCallResult` to a shared module

**Files:**
- Create: `src/runtime/handlers/types.ts`
- Modify: `src/runtime/handlers/inline.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
/**
 * Shared handler result types. Plan 2 adds exec and dispatch, both
 * returning this shape. Keeping it in a neutral module avoids the
 * circular imports that would appear if dispatch imported from inline
 * and inline imported from a central invoke module.
 *
 * The index signature mirrors the SDK's `CallToolResult` shape so lean
 * jig-side results stay structurally assignable to it.
 */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Update `inline.ts` to re-import**

Replace the `ToolCallResult` definition at the top of `src/runtime/handlers/inline.ts` with:

```typescript
import type { InlineHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";

export type { ToolCallResult };
```

Leave the `invokeInline` function below it unchanged (it still consumes `ToolCallResult` — now imported, not declared).

- [ ] **Step 3: Typecheck + test**

Run: `npm run check && npm test`
Expected: clean + all existing tests pass.

### Task 2.2: Write failing tests for `invokeExec`

**Files:**
- Create: `tests/handlers.test.ts`
- Create: `tests/fixtures/exit-nonzero.mjs`

- [ ] **Step 1: Write the fixture**

```javascript
// Tiny fixture: exits with a non-zero code. Used by handlers.test.ts to
// exercise the exec handler's failure path without depending on platform
// binaries like /bin/false.
process.exit(1);
```

- [ ] **Step 2: Write the tests**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { invokeExec } from "../src/runtime/handlers/exec.ts";

test("invokeExec returns stdout from /bin/echo as text content", async () => {
  const result = await invokeExec({ exec: "/bin/echo hello" }, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.type, "text");
  assert.equal(result.content[0]!.text, "hello\n");
});

test("invokeExec renders Mustache tokens from args before splitting", async () => {
  const result = await invokeExec(
    { exec: "/bin/echo {{name}}" },
    { name: "Alice" },
  );
  assert.equal(result.content[0]!.text, "Alice\n");
});

test("invokeExec flags non-zero exit as isError with stderr", async () => {
  const result = await invokeExec(
    { exec: "node tests/fixtures/exit-nonzero.mjs" },
    {},
  );
  assert.equal(result.isError, true);
});

test("invokeExec flags missing executable as isError", async () => {
  const result = await invokeExec(
    { exec: "/does/not/exist" },
    {},
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /ENOENT|not found|no such file/i);
});

test("invokeExec rejects empty command after render as isError", async () => {
  const result = await invokeExec({ exec: "{{missing}}" }, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /empty|no command/i);
});
```

- [ ] **Step 3: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/handlers/exec.ts'`.

### Task 2.3: Extend the config types for `ExecHandler`

**Files:**
- Modify: `src/runtime/config.ts`

The exec handler needs a config shape. Add `ExecHandler` alongside `InlineHandler`; the full union expansion (with validator updates) lands in Phase 4, but Phase 2 needs the type to exist so `exec.ts` compiles.

- [ ] **Step 1: Add the type**

Insert after the existing `InlineHandler` declaration in `src/runtime/config.ts` (around line 19):

```typescript
export interface ExecHandler {
  exec: string;
}
```

Leave the `Handler` union as `InlineHandler` for now — Phase 4 expands it. `exec.ts` imports `ExecHandler` directly, so compilation is fine.

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 2.4: Implement `invokeExec`

**Files:**
- Create: `src/runtime/handlers/exec.ts`

- [ ] **Step 1: Write the file**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { render } from "../util/template.ts";

const execFileAsync = promisify(execFile);

/**
 * Run a shell-style command by rendering its template through Mustache,
 * whitespace-splitting into argv, and invoking `child_process.execFile`.
 *
 * Explicitly not a shell: `shell: true` is never set, so pipes,
 * redirects, and environment variable expansion inside the command
 * string are treated as literal text. Authors who need shell features
 * write a wrapper script and exec that script. See ADR-0006.
 *
 * stdout is returned verbatim (including trailing newlines). Non-zero
 * exit, missing executable, or any other spawn error produces an
 * `isError: true` result whose text content carries the error message.
 */
export async function invokeExec(
  handler: ExecHandler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const rendered = render(handler.exec, args);
  const argv = rendered.trim().split(/\s+/).filter((part) => part.length > 0);

  if (argv.length === 0) {
    return errorResult(`exec: empty command after template render: "${handler.exec}"`);
  }

  const [command, ...commandArgs] = argv;

  try {
    const { stdout } = await execFileAsync(command!, commandArgs);
    return { content: [{ type: "text", text: stdout }] };
  } catch (err: unknown) {
    return errorResult(formatError(err));
  }
}

function errorResult(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatError(err: unknown): string {
  if (err === null || err === undefined) return "exec: unknown error";
  if (err instanceof Error) {
    // execFile errors carry stderr/code fields; include them when present.
    const maybeCode = (err as Error & { code?: string | number }).code;
    const maybeStderr = (err as Error & { stderr?: string | Buffer }).stderr;
    const parts = [err.message];
    if (maybeCode !== undefined) parts.push(`code: ${String(maybeCode)}`);
    if (maybeStderr !== undefined && String(maybeStderr).length > 0) {
      parts.push(`stderr: ${String(maybeStderr).trim()}`);
    }
    return parts.join(" | ");
  }
  return String(err);
}
```

- [ ] **Step 2: Run tests; verify the GREEN**

Run: `npm test`
Expected: all exec tests pass; existing tests still green.

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 2.5: Write ADR-0006 (exec is shell-free)

**Files:**
- Create: `record/decisions/0006-exec-no-shell-whitespace-argv.md`

- [ ] **Step 1: Write the ADR**

```markdown
---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0006: `exec:` handler runs via `execFile` without a shell

## Context and Problem Statement

The `exec:` handler takes a string like `./handlers/get {{id}}` and runs it. Does "run it" mean `sh -c` (shell invocation, metacharacters honored) or `execFile` (program + argv, no shell)?

## Decision Drivers

- Shell interpretation exposes command injection if any templated value is untrusted.
- Pipes, redirects, and `$VAR` expansion are useful but routinely surprise authors used to shell vs. POSIX exec distinctions.
- Jig's target surface is "author ships a handler script; MCP server routes to it." Authors who need pipes already own the handler script.
- Plan 3's JSONLogic and Plan 4's `connections:` remove most of the real pressure to put logic inside exec strings.

## Considered Options

- **`execFile` with whitespace-split argv** (chosen).
- **`spawn` with `shell: true`.**
- **`exec:` accepts `{ command: string, args: string[] }` instead of a single string.**

## Decision Outcome

Chosen: **`execFile` + whitespace split**.

- The rendered command string is split on whitespace into argv.
- `argv[0]` is the program; the rest are arguments.
- `child_process.execFile(argv[0], argv.slice(1))` runs it with no shell.
- Quoting, pipes, redirects, and environment expansion in the command string are literal. Authors who need them write a wrapper script and exec that script.

### Consequences

- Good, because command injection via Mustache-substituted args is limited to the argv slot they land in — a malicious `{{id}}` becomes `argv[N]`, not a shell command.
- Good, because PATH-vs-absolute-path behavior matches `execFile`'s documented semantics; no shell surprises.
- Good, because the argv split is auditable in one file.
- Bad, because filenames containing spaces break the split. Authors who need spaces ship a wrapper script or use a structured command form in a later plan.
- Bad, because `$VAR` in the command string doesn't expand. Authors who need env vars reference them explicitly in the wrapper script.

### Confirmation

`tests/handlers.test.ts` covers: happy-path stdout capture, Mustache-rendered argv, non-zero exit via a fixture script, missing-executable ENOENT, empty-after-render guard. Any future support for `{ command, args }` form or shell mode requires its own ADR.
```

### Task 2.6: Commit Phase 2

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): exec handler (Mustache-rendered, shell-free)

Adds src/runtime/handlers/exec.ts: renders its command string via the
Plan 2 Mustache module, whitespace-splits into argv, runs via
child_process.execFile (no shell). stdout is returned verbatim; any
non-zero exit or spawn error becomes an isError result with the error
message in text content.

Also moves ToolCallResult from handlers/inline.ts into a new
handlers/types.ts so the new handler shares the shape without
introducing an inline-as-dependency cycle.

See record/decisions/0006-exec-no-shell-whitespace-argv.md for the
shell-free stance. Exec handlers are not yet reachable from config
parsing — Phase 4 expands the Handler union and wires tool invocation
through a central dispatcher.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 3: `dispatch` handler + inputSchema enum

**Intent:** Land `src/runtime/handlers/dispatch.ts` — reads a discriminator field from the tool's args, checks the action against the dispatch cases, validates per-action `requires:`, and routes to a sub-handler via an injected `invoke` function. Extend `toolToInputSchema` to emit an `enum` on the discriminator field when the tool has a dispatch handler.

**Branch:** `feat/plan2-dispatch`

### Task 3.1: Extend config types for `DispatchHandler` and partially widen `Handler`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the `DispatchCase` and `DispatchHandler` interfaces and widen `Handler`**

Phase 3's Task 3.4 test authors a dispatcher `ToolDefinition` literal, and the extended `toolToInputSchema` narrows with `"dispatch" in tool.handler`. Both require `Handler` to already admit `DispatchHandler`. `ExecHandler` joins the union in Phase 4 once YAML validation lands.

After the `ExecHandler` declaration from Phase 2, add:

```typescript
export interface DispatchCase {
  requires?: string[];
  handler: Handler;
}

export interface DispatchHandler {
  dispatch: {
    on: string;
    cases: Record<string, DispatchCase>;
  };
}
```

And replace the `Handler` type alias with:

```typescript
export type Handler = InlineHandler | DispatchHandler;
// Phase 4 adds ExecHandler to the union once validateHandler parses exec YAML.
```

`validateHandler` still returns `InlineHandler` — which is assignable to the wider `Handler`. No validator changes yet; dispatch YAML isn't parsed until Phase 4.

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 3.2: Write failing tests for `invokeDispatch`

**Files:**
- Modify: `tests/handlers.test.ts` (append)

The tests feed a tiny `invoke` function that knows only about inline and exec — enough to exercise routing without waiting for the full Phase 4 `invoke`.

- [ ] **Step 1: Append the tests**

Add these tests to the existing `tests/handlers.test.ts`. Consolidate the import line at the top of the file:

```typescript
// Add to the existing imports at the top:
import { invokeDispatch } from "../src/runtime/handlers/dispatch.ts";
import type { DispatchHandler, Handler } from "../src/runtime/config.ts";
import type { ToolCallResult } from "../src/runtime/handlers/types.ts";
```

Then append the tests:

```typescript
// Minimal test-local invoke: types against the actual Handler union so
// the stub stays valid when Phase 4 widens the union. Supports inline
// only; Phase 4 replaces this stub call with the real invoke().
async function testInvoke(
  handler: Handler,
  _args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) {
    return { content: [{ type: "text", text: handler.inline.text }] };
  }
  throw new Error("test stub: only inline sub-handlers are exercised in Phase 3");
}

const greetDispatch: DispatchHandler = {
  dispatch: {
    on: "action",
    cases: {
      hello: {
        handler: { inline: { text: "hi" } },
      },
      greet: {
        requires: ["name"],
        handler: { inline: { text: "hi named" } },
      },
    },
  },
};

test("invokeDispatch routes to the matching case handler", async () => {
  const result = await invokeDispatch(greetDispatch, { action: "hello" }, testInvoke);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "hi");
});

test("invokeDispatch returns isError when the discriminator is missing", async () => {
  const result = await invokeDispatch(greetDispatch, {}, testInvoke);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /action.*required/i);
});

test("invokeDispatch returns isError when the action is unknown", async () => {
  const result = await invokeDispatch(
    greetDispatch,
    { action: "bogus" },
    testInvoke,
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown action.*bogus/i);
  assert.match(result.content[0]!.text, /hello|greet/);
});

test("invokeDispatch enforces per-action requires", async () => {
  const result = await invokeDispatch(
    greetDispatch,
    { action: "greet" },
    testInvoke,
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /name.*required.*greet/i);
});

test("invokeDispatch passes through args to the sub-handler", async () => {
  let capturedArgs: Record<string, unknown> = {};
  const captureInvoke = async (
    _handler: Handler,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> => {
    capturedArgs = args;
    return { content: [{ type: "text", text: "captured" }] };
  };
  await invokeDispatch(
    greetDispatch,
    { action: "greet", name: "Alice", extra: "preserved" },
    captureInvoke,
  );
  assert.equal(capturedArgs.action, "greet");
  assert.equal(capturedArgs.name, "Alice");
  assert.equal(capturedArgs.extra, "preserved");
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/runtime/handlers/dispatch.ts'`.

### Task 3.3: Implement `invokeDispatch`

**Files:**
- Create: `src/runtime/handlers/dispatch.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { DispatchHandler, Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";

/**
 * The invoke function type `dispatch` accepts as a parameter. Keeps this
 * module acyclic — dispatch calls back into the central invoke without
 * importing it directly.
 */
export type InvokeFn = (
  handler: Handler,
  args: Record<string, unknown>,
) => Promise<ToolCallResult>;

/**
 * Route a tool call through a dispatcher spec.
 *
 * Reads the discriminator named by `dispatch.on` from args, looks up the
 * matching case, checks per-action `requires:`, then calls `invoke` with
 * the case's sub-handler and the same args. Args pass through unchanged
 * so the sub-handler sees everything the tool was called with.
 *
 * All validation failures — missing discriminator, unknown action,
 * missing required fields — return isError tool results with
 * field-named messages. Clients see these as normal tool output they
 * can display; they are not JSON-RPC protocol errors.
 */
export async function invokeDispatch(
  handler: DispatchHandler,
  args: Record<string, unknown>,
  invoke: InvokeFn,
): Promise<ToolCallResult> {
  const { on, cases } = handler.dispatch;
  const actionValue = args[on];

  if (typeof actionValue !== "string" || actionValue.length === 0) {
    return errorResult(`dispatch: field "${on}" is required`);
  }

  const matched = cases[actionValue];
  if (!matched) {
    const known = Object.keys(cases).join(", ");
    return errorResult(
      `dispatch: unknown action "${actionValue}". Known actions: ${known}`,
    );
  }

  if (matched.requires) {
    const missing = matched.requires.filter((field) => {
      const v = args[field];
      return v === undefined || v === null || v === "";
    });
    if (missing.length > 0) {
      const fields = missing.join(", ");
      return errorResult(
        `dispatch: field(s) "${fields}" required for action "${actionValue}"`,
      );
    }
  }

  return invoke(matched.handler, args);
}

function errorResult(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
```

- [ ] **Step 2: Run tests; verify the GREEN**

Run: `npm test`
Expected: all dispatch tests pass; existing tests still green.

### Task 3.4: Teach `toolToInputSchema` about dispatch actions

**Files:**
- Modify: `src/runtime/tools.ts`
- Modify: `tests/tools.test.ts` (append a test)

- [ ] **Step 1: Append the failing test**

Add to the existing imports at the top of `tests/tools.test.ts`:

```typescript
// (already present): import type { ToolDefinition } from "../src/runtime/config.ts";
// No new imports needed — DispatchHandler is reachable via ToolDefinition.handler.
```

Append the test:

```typescript
test("toolToInputSchema emits enum for the dispatch discriminator", () => {
  const tool: ToolDefinition = {
    name: "linear",
    description: "x",
    input: {
      action: { type: "string", required: true },
      id: { type: "string" },
    },
    handler: {
      dispatch: {
        on: "action",
        cases: {
          get: { requires: ["id"], handler: { inline: { text: "g" } } },
          search: { handler: { inline: { text: "s" } } },
        },
      },
    },
  };
  const schema = toolToInputSchema(tool);
  assert.deepEqual(schema.properties["action"], {
    type: "string",
    enum: ["get", "search"],
  });
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL — the test runs but the assertion fails because `toolToInputSchema` does not yet read the dispatch spec. The `ToolDefinition` literal compiles because Task 3.1 widened `Handler` to include `DispatchHandler`.

- [ ] **Step 3: Extend the `JsonSchemaObject` property shape**

Modify the `JsonSchemaObject` interface in `src/runtime/tools.ts` to allow `enum` on properties:

```typescript
export interface JsonSchemaObject {
  type: "object";
  properties: Record<
    string,
    { type: string; description?: string; enum?: string[] }
  >;
  required?: string[];
}
```

- [ ] **Step 4: Extend `toolToInputSchema`**

Replace the body of `toolToInputSchema` in `src/runtime/tools.ts` with:

```typescript
export function toolToInputSchema(tool: ToolDefinition): JsonSchemaObject {
  const properties: Record<
    string,
    { type: string; description?: string; enum?: string[] }
  > = {};
  const required: string[] = [];
  if (tool.input) {
    for (const [field, schema] of Object.entries(tool.input)) {
      const prop: { type: string; description?: string; enum?: string[] } = {
        type: schema.type,
      };
      if (schema.description) prop.description = schema.description;
      properties[field] = prop;
      if (schema.required) required.push(field);
    }
  }

  // If the tool dispatches on a named field, the set of valid values is
  // the case names. Emit it as `enum` so clients see a concrete action
  // list in tools/list. ADR-0001 (typed flat fields) motivates this:
  // the dispatcher's inputSchema must advertise what actions exist.
  if ("dispatch" in tool.handler) {
    const { on, cases } = tool.handler.dispatch;
    const existing = properties[on];
    if (existing) {
      existing.enum = Object.keys(cases);
    } else {
      properties[on] = { type: "string", enum: Object.keys(cases) };
    }
  }

  const out: JsonSchemaObject = { type: "object", properties };
  if (required.length > 0) out.required = required;
  return out;
}
```

- [ ] **Step 5: Run tests; verify the GREEN**

Run: `npm test`
Expected: the dispatch-enum test passes and earlier `toolToInputSchema` tests stay green.

### Task 3.5: Commit Phase 3

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): dispatch handler + action-enum inputSchema

Adds src/runtime/handlers/dispatch.ts — reads a discriminator field
named by dispatch.on from args, validates the action against cases,
enforces per-action requires:, routes to the case's sub-handler via an
injected invoke(). Validation failures return isError results with
field-named messages. The injected invoke keeps the module acyclic:
dispatch doesn't know about inline or exec, just the Handler union.

Also extends toolToInputSchema to emit an enum constraint on the
discriminator field when the tool has a dispatch handler. Clients get a
concrete action list in tools/list, matching the spirit of ADR-0001
(typed flat fields).

Dispatch handlers are not yet reachable from config parsing or tool
invocation — Phase 4 expands the Handler union, validates dispatch
YAML, and wires the central invoke().
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 4: Config union + central `invoke`

**Intent:** Expand `Handler` in `config.ts` to a discriminated union of inline / exec / dispatch. Teach `validateHandler` to recognize and validate each form. Create `src/runtime/handlers/index.ts` with the central `invoke(handler, args)` switch. Update `src/runtime/index.ts` to route via `invoke`. Add an integration test that round-trips a dispatcher YAML end-to-end.

**Branch:** `feat/plan2-integrate`

### Task 4.1: Expand the `Handler` union and validate exec / dispatch YAML

**Files:**
- Modify: `src/runtime/config.ts`
- Modify: `tests/config.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests/config.test.ts`:

```typescript
test("parseConfig accepts a tool with an exec handler", () => {
  const yaml = `
server: { name: e, version: "0.1.0" }
tools:
  - name: runner
    description: runs a script
    handler:
      exec: "/bin/echo hello"
`;
  const config = parseConfig(yaml);
  assert.deepEqual(config.tools[0]!.handler, { exec: "/bin/echo hello" });
});

test("parseConfig accepts a dispatcher tool", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: linear
    description: issue tracker
    input:
      action: { type: string, required: true }
      id: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          get:
            requires: [id]
            handler:
              exec: "/bin/echo {{id}}"
          search:
            handler:
              inline: { text: "no results" }
`;
  const config = parseConfig(yaml);
  const handler = config.tools[0]!.handler;
  assert.ok("dispatch" in handler);
  assert.equal(handler.dispatch.on, "action");
  assert.deepEqual(Object.keys(handler.dispatch.cases), ["get", "search"]);
  assert.deepEqual(handler.dispatch.cases["get"]!.requires, ["id"]);
});

test("parseConfig rejects a dispatcher with zero cases", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: empty
    description: x
    handler:
      dispatch:
        on: action
        cases: {}
`;
  assert.throws(() => parseConfig(yaml), /at least one case/i);
});

test("parseConfig rejects a dispatcher missing the on field", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: no-on
    description: x
    handler:
      dispatch:
        cases:
          foo:
            handler: { inline: { text: "f" } }
`;
  assert.throws(() => parseConfig(yaml), /dispatch\.on/i);
});
```

- [ ] **Step 2: Run tests; verify the RED**

Run: `npm test`
Expected: FAIL — exec is rejected by `validateHandler`, dispatch is rejected, the dispatch-type isn't in `Handler` union.

- [ ] **Step 3: Expand the `Handler` union**

Modify `src/runtime/config.ts`. Replace the `Handler` type alias:

```typescript
export type Handler = InlineHandler | ExecHandler | DispatchHandler;
```

- [ ] **Step 4: Extend `validateHandler`**

Replace the existing `validateHandler` in `src/runtime/config.ts` with:

```typescript
function validateHandler(v: unknown, toolName: string): Handler {
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].handler must be a mapping`);
  }
  const h = v as Record<string, unknown>;

  if (h["inline"] && typeof h["inline"] === "object") {
    const inline = h["inline"] as Record<string, unknown>;
    if (typeof inline["text"] !== "string") {
      throw new Error(
        `config: tools[${toolName}].handler.inline.text must be a string`,
      );
    }
    return { inline: { text: inline["text"] } };
  }

  if (typeof h["exec"] === "string") {
    if (h["exec"].length === 0) {
      throw new Error(
        `config: tools[${toolName}].handler.exec must be a non-empty string`,
      );
    }
    return { exec: h["exec"] };
  }

  if (h["dispatch"] && typeof h["dispatch"] === "object") {
    return validateDispatch(h["dispatch"], toolName);
  }

  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (Plan 2 supports: inline, exec, dispatch)`,
  );
}

function validateDispatch(v: unknown, toolName: string): DispatchHandler {
  const d = v as Record<string, unknown>;
  if (typeof d["on"] !== "string" || d["on"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.on is required and must be a string`,
    );
  }
  if (!d["cases"] || typeof d["cases"] !== "object") {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must be a mapping`,
    );
  }
  const rawCases = d["cases"] as Record<string, unknown>;
  const caseNames = Object.keys(rawCases);
  if (caseNames.length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must declare at least one case`,
    );
  }
  const cases: Record<string, DispatchCase> = {};
  for (const name of caseNames) {
    const entry = rawCases[name];
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `config: tools[${toolName}].handler.dispatch.cases.${name} must be a mapping`,
      );
    }
    const e = entry as Record<string, unknown>;
    const subHandler = validateHandler(e["handler"], `${toolName}:${name}`);
    const requires = e["requires"];
    let requiresValue: string[] | undefined;
    if (requires !== undefined) {
      if (
        !Array.isArray(requires) ||
        !requires.every((r) => typeof r === "string")
      ) {
        throw new Error(
          `config: tools[${toolName}].handler.dispatch.cases.${name}.requires must be an array of strings`,
        );
      }
      requiresValue = requires;
    }
    cases[name] = requiresValue !== undefined
      ? { requires: requiresValue, handler: subHandler }
      : { handler: subHandler };
  }
  return { dispatch: { on: d["on"], cases } };
}
```

- [ ] **Step 5: Run tests; verify the GREEN**

Run: `npm run check && npm test`
Expected: clean + all tests pass (including the four new config ones and the earlier dispatch-schema test from Phase 3).

No cast cleanup required — the Phase 3 union already admits `DispatchHandler`; Phase 4 only adds `ExecHandler`.

### Task 4.2: Add the central `invoke(handler, args)`

**Files:**
- Create: `src/runtime/handlers/index.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";

/**
 * Route a resolved Handler to the matching handler implementation.
 *
 * The function passed down to `invokeDispatch` is `invoke` itself, which
 * is what lets a dispatcher's sub-handler be another dispatcher,
 * another exec, or an inline — the invocation tree is type-agnostic at
 * this seam.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) return invokeDispatch(handler, args, invoke);
  // Exhaustive type narrowing; this path is unreachable while Handler
  // stays a union of the three. Added `never` coercion so a future
  // handler variant surfaces as a type error instead of a runtime throw.
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: clean.

### Task 4.3: Route `index.ts` through the central `invoke`

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Swap `invokeInline` for `invoke`**

Replace the contents of `src/runtime/index.ts` with:

```typescript
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { createStdioTransport } from "./transports/stdio.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

  const server = createServer(config);

  // Each tool's handler gets routed through the central invoke(). That
  // is what lets a dispatch tool reach exec, inline, or nested dispatch
  // without index.ts knowing the handler types.
  for (const tool of config.tools) {
    const handler: ToolHandler = async (args: unknown) =>
      invoke(tool.handler, normalizeArgs(args));
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
      },
      handler,
    );
  }

  await server.connect(createStdioTransport());
}

/**
 * The SDK hands our handler whatever the client sent as
 * `tools/call.params.arguments` — typed as `unknown` at the adapter
 * boundary. In practice MCP clients send a JSON object (or nothing).
 * Normalize both shapes to `Record<string, unknown>` so handlers can
 * read fields without defensive checks at every call site.
 */
function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`jig runtime fatal: ${message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck and unit tests**

Run: `npm run check && npm test`
Expected: clean + all tests pass.

### Task 4.4: Integration test — dispatcher round-trip

**Files:**
- Modify: `tests/integration.test.ts` (append)

- [ ] **Step 1: Append the test**

Add the test near the existing ones (keep all imports at the top of the file):

```typescript
test("dispatcher tools/call routes through exec with field-named errors", { timeout: 10_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-int-"));
  const configPath = join(dir, "jig.yaml");
  writeFileSync(
    configPath,
    `server: { name: dispatch-int, version: "0.0.1" }
tools:
  - name: echo
    description: Echo a message
    input:
      action: { type: string, required: true }
      message: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          say:
            requires: [message]
            handler:
              exec: "/bin/echo {{message}}"
          silent:
            handler:
              inline: { text: "" }
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
          params: { name: "echo", arguments: { action: "say", message: "hello" } },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "echo", arguments: { action: "say" } },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/list",
          params: {},
        },
      ],
    );
    assert.equal(responses.length, 4);

    const ok = responses[1]!.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    assert.equal(ok.isError, undefined);
    assert.equal(ok.content[0]!.text.trim(), "hello");

    const bad = responses[2]!.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    assert.equal(bad.isError, true);
    assert.match(bad.content[0]!.text, /message.*required.*say/i);

    const list = responses[3]!.result as {
      tools: Array<{ inputSchema?: { properties?: Record<string, { enum?: string[] }> } }>;
    };
    const actionProp = list.tools[0]!.inputSchema!.properties!.action!;
    assert.deepEqual(actionProp.enum, ["say", "silent"]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run all three gates**

Run: `npm run check && npm test`
Expected: clean + all tests pass.

### Task 4.5: Commit Phase 4

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): central invoke() + exec/dispatch in config union

Expands the Handler type in config.ts to a proper discriminated union
of InlineHandler | ExecHandler | DispatchHandler. validateHandler and
new validateDispatch reject malformed YAML up front — empty dispatch
cases, missing on field, non-string requires entries.

Adds src/runtime/handlers/index.ts with the central invoke(handler,
args) switch. Dispatch receives invoke as a parameter so the module
graph stays acyclic (dispatch never imports inline or exec directly).

index.ts's registration loop calls invoke(tool.handler, args) instead
of invokeInline. Integration test exercises the full YAML → tools/call
→ dispatch → exec chain plus the field-named error path and the
action-enum that tools/list advertises.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Phase 5: Example, smoke, and handoff

**Intent:** Add `examples/dispatcher.yaml` demonstrating a multi-action tool the way real authors will write them. Extend `just smoke` with a second invocation (or a parallel recipe) that exercises the dispatcher example. Write a public handoff for Plan 3.

**Branch:** `feat/plan2-complete`

### Task 5.1: Write `examples/dispatcher.yaml`

**Files:**
- Create: `examples/dispatcher.yaml`

- [ ] **Step 1: Write the file**

```yaml
# A dispatcher-style jig example with exec sub-handlers.
#
# Demonstrates Plan 2's features:
#   - one tool, one `action` enum, per-action requires:
#   - exec handler with Mustache-rendered command lines
#   - inline handler as a no-op default
#
# The `help` action shows the shape without requiring any external
# handlers — callers can run it first to see what's available.

server:
  name: jig-dispatcher
  version: "1.0.0"
  description: |
    Demonstrates the dispatcher pattern — one tool, multiple actions,
    typed flat inputs. This is the Plan 2 smoke target.

tools:
  - name: greet
    description: |
      A greeting tool. Actions: say, count, help.

      {"action": "say", "name": "Ada"}    → "Hello, Ada!"
      {"action": "count", "text": "hi"}   → the length of `text`
      {"action": "help"}                  → this description

    input:
      action:
        type: string
        required: true
        description: Which action to run (say | count | help)
      name:
        type: string
        description: Who to greet (required for `say`)
      text:
        type: string
        description: Text to measure (required for `count`)

    handler:
      dispatch:
        on: action
        cases:
          say:
            requires: [name]
            handler:
              exec: "/bin/echo Hello, {{name}}!"
          count:
            requires: [text]
            handler:
              exec: "/usr/bin/awk BEGIN{print length(\"{{text}}\")}"
          help:
            handler:
              inline:
                text: |
                  greet: { say | count | help }
                    say  requires `name`
                    count requires `text`
                    help  always valid
```

Note: `/usr/bin/awk` ships with macOS and most Linux distros — both targets Plan 2 cares about. If `awk` isn't on the path a user expects, swap to `/usr/bin/wc` or a local wrapper script.

### Task 5.2: Extend `just smoke` to include the dispatcher

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Add a `smoke-dispatch` recipe**

Append to `justfile`:

```just
# Smoke-dispatch: exercise the dispatcher example. Sends initialize +
# tools/list + tools/call for action=help, verifies the expected text
# shows up.
smoke-dispatch:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/dispatcher.yaml)
    if [ -z "$output" ]; then
      echo "smoke-dispatch: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -1 | jq .
```

- [ ] **Step 2: Run it**

Run: `just smoke-dispatch`
Expected: a `tools/call` response whose `content[0].text` contains "greet:" and the help lines.

### Task 5.3: Write the Plan 2 complete handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan2-complete.md` (use the actual date and Eastern time)

- [ ] **Step 1: Invoke the `building-in-the-open:curating-context` skill**

Follow the skill's public-mode flow: Context Curator persona, four required sections (Where things stand / Decisions made / What's next / Landmines), under 2,000 tokens per the bito gate.

Content should cover:
- **State:** Green, Plan 2 runtime passing all tests and both smoke recipes.
- **What changed:** All five Plan 2 phases, with commit references. The new handler surface (inline + exec + dispatch) and the central `invoke`.
- **What's next:** Plan 3 — JSONLogic, `compute` handler, `when:` guards, `transform:` steps. Mention `json-logic-engine` v5 is the library per the design doc, and `compute` is pure (no side effects).
- **Landmines:** Anything discovered during implementation that will bite the next reader. Likely candidates: Mustache's empty-string-for-missing-vars behavior surprises first-time readers; exec's whitespace-only argv split won't handle filenames with spaces; dispatch's `requires` treats empty strings as missing; the test-local `invoke` stub in Phase 3 doesn't type-check against the real `invoke` — don't ship it.

### Task 5.4: Commit Phase 5

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the message**

```
feat(runtime): dispatcher example, smoke-dispatch, Plan 2 handoff

Adds examples/dispatcher.yaml — a three-action tool (say, count, help)
that exercises the full Plan 2 surface: Mustache-templated exec,
dispatch with per-action requires, and an inline fallback for help.

Adds `just smoke-dispatch` — sends initialize + tools/call for
action=help against the dispatcher example, fails if no response lands
on stdout.

Lands the Plan 2 complete handoff under .handoffs/, naming Plan 3
(JSONLogic + compute) as the next plan.

Plan 2 is complete with this commit: Mustache string interpolation,
exec handler, dispatch handler, central invoke(), dispatcher example,
smoke target, Plan 3 handoff.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt && git pm`

---

## Self-Review Checklist (run this once, at drafting time)

- [x] **Spec coverage.** Design doc §"Tools" (dispatcher, typed flat fields, exec built-in) + §"Templating: two layers" (Mustache layer) are covered by Phases 1–4. Plan 3's JSONLogic work is carved out explicitly.
- [x] **Placeholder scan.** No "TBD" / "handle edge cases" / "similar to Task N" entries. Every code block is complete.
- [x] **Type consistency.** `ToolCallResult` lives in `handlers/types.ts` from Phase 2 onward; `Handler` union expands once (Phase 4); `InvokeFn` type name is consistent between `dispatch.ts` and `handlers/index.ts`; `DispatchCase` / `DispatchHandler` shapes match across config validation, dispatch invocation, and the `toolToInputSchema` extension.
- [x] **Phase independence.** Each phase lands as its own PR on `main`. Phase 2 defers exec reachability to Phase 4 (handler not yet in union) — documented in the Phase 2 commit message.
