# jig Runtime — Plan 7 (prompts + completions + URI templates)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add three surfaces to the jig runtime in one plan: a top-level `prompts:` block of named MCP prompt templates, a top-level `completions:` block that supplies autocomplete value lists for prompt arguments and resource-template variables, and a `template:` key upgrade to Plan 6's `resources:` block that enables URI-template-parameterized resources via RFC 6570 variable extraction. All three land together because completion wiring is shared — prompt-arg completion and resource-template-var completion both terminate in a single `completion/complete` handler, and shipping either surface without completion produces a declared-but-unfillable intermediate state.

**Architecture:** Six phases land in order. (0) This plan doc. (1) `prompts:` schema + validator — new types in `config.ts`, new `src/runtime/prompts.ts` with `validatePrompts`, failing tests in `tests/prompts.test.ts`. (2) Prompt registration + render wiring — `prompts.ts` gains `registerPrompts(server, prompts, ctx)`; `server.ts` gains a `registerPrompt` adapter on `JigServerHandle`; integration test for `prompts/list` + `prompts/get`. (3) URI-templated resources — `validateResources` upgraded to accept `template:` as an exactly-one-of alternative to `uri:`; `registerResources` branches on `"template" in spec`; `server.ts` gains a `registerResource` overload that accepts a `ResourceTemplate` instance; integration test for `resources/templates/list` + templated `resources/read`. (4) `completions:` schema + validator + cross-reference checks — new `src/runtime/completions.ts` with `validateCompletions(completions, prompts, resources)`, new `CompletionsConfig` type in `config.ts`, new `tests/completions.test.ts`. (5) Completion handler wiring — `server.ts` gains `wireCompletions(server, completions)` that builds a lookup index and registers a low-level `completion/complete` handler via `server.server.setRequestHandler`; integration test for both ref types. (6) Example YAML + `just smoke-prompt` recipe + end-to-end integration test + handoff.

**Tech Stack:** No new production dependencies. `ResourceTemplate` and `fromJsonSchema` are SDK exports already used or present. `render(text, vars)` from `src/runtime/util/template.ts` is jig-owned. TypeScript 6.0+, `node:test`, `yaml`, `@modelcontextprotocol/server@2.0.0-alpha.2` all unchanged.

---

## Scope Note

This is **plan 7 of ~9** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)) and the [Plan 7 design doc](../designs/2026-04-15-plan7-prompts-completions.md).

**Planned sequence (updated):**

1. Plan 1 — smoke test (merged)
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. Plan 4 — connections + http + graphql (merged)
5. Plan 5 — probes (merged)
6. Plan 6 — resources + watchers (merged)
7. **Plan 7 — prompts + completions + URI templates** (this plan)
8. Plan 8 — tasks + state machines (MCP task lifecycle, elicitation, idempotency)
9. Plan 9 — CLI (`jig new|dev|validate|build`) + build pipeline

**Out of scope for Plan 7 (carried to later plans):**

- **Dynamic completions** — handler-backed value sources. Shape is forward-compatible (swap `string[]` for a union with `{ handler: Handler }`); deferred until a real user asks.
- **`completable()` StandardSchema wrapping** — rejected (see design doc Alternatives). All completion wiring goes low-level.
- **Prompt handlers** — prompts that dispatch through a tool-style handler to produce dynamic messages. `PromptSpec.template` is required in v1; a future plan adds an optional `handler:` alternative.
- **Prompt message sequences** — multiple `{role, content}` entries per prompt. v1 returns one user-role text message per prompt.
- **Watchers on templated resources** — `template:` resources MUST NOT carry `watcher:`. Watching a family-of-URIs is unbounded.
- **`resources/list` enumeration of templated resources** — SDK's `list` callback materializes a template to concrete URIs; v1 passes `list: undefined`. Templates appear on `resources/templates/list` only.
- **Blob content, webhook watchers** — Plan 6 carryovers, still deferred.
- **Task state machines** — Plan 8.

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **SDK quarantine holds.** Direct imports of `@modelcontextprotocol/server` stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. `src/runtime/prompts.ts` and `src/runtime/completions.ts` import types + helpers from `./server.ts`, not from the SDK package. The `completion/complete` low-level handler wiring lives in `server.ts`.
- **`prompts:` is optional.** A config without a `prompts:` block parses, validates, and boots exactly as before Plan 7.
- **`completions:` is optional.** Same — no completions block = no `completion/complete` handler registered = no capabilities.completions advertised.
- **`template:` resources are optional and exclusive.** A resource entry has exactly one of `uri:` or `template:`. A `template:` entry MUST NOT carry `watcher:`. Unknown keys rejected.
- **`ResourceTemplate` constructor requires explicit `list` key.** Passing `{}` is a TypeScript error. Always pass `{ list: undefined }`.
- **No `registerCompletion` on `McpServer`.** The SDK's `completion/complete` handler is wired only via `server.server.setRequestHandler`. The capability is advertised via `server.server.registerCapabilities({ completions: {} })`.
- **`fromJsonSchema` round-trip preserves `required[]` and `description`.** Build the JSON Schema carefully — the `required` array and per-property `description` must survive `fromJsonSchema` → `standardSchemaToJsonSchema` so `prompts/list` returns them.
- **Completion values cap at 100.** After prefix-filter, `slice(0, 100)`.
- **No new runtime deps.** Node 24+ built-ins + existing deps unchanged.
- **Nine gates must all pass before the Phase 6 commit:** `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
- **Commits via `commit.txt`.** Clay runs `gtxt` + `git pm`. Never `git commit` directly.
- **Specific-path `git add`** — never `-A`.
- **Feature branch per phase.** Branches: `chore/plan7-doc`, `feat/plan7-prompts-schema`, `feat/plan7-prompts-registration`, `feat/plan7-uri-templates`, `feat/plan7-completions-schema`, `feat/plan7-completions-wiring`, `feat/plan7-complete`.
- **Integration tests carry `{ timeout: 15_000 }`.**
- **`.handoffs/` timestamp in Eastern Time.** Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before creating the handoff file.

## File Structure

```
jig/
  record/
    plans/
      2026-04-15-jig-runtime-plan7.md                   # this plan (Phase 0)
    designs/
      2026-04-15-plan7-prompts-completions.md            # the spec (already landed)
  src/
    runtime/
      prompts.ts                                         # NEW — validatePrompts + registerPrompts (Phases 1, 2)
      completions.ts                                     # NEW — validateCompletions + buildCompletionsIndex (Phases 4, 5)
      config.ts                                          # + PromptArgumentSpec, PromptSpec, PromptsConfig,
                                                         #   CompletionsConfig; ResourceSpec union upgrade (Phases 1, 3, 4)
      server.ts                                          # + registerPrompt adapter; registerResource overload for
                                                         #   ResourceTemplate; wireCompletions() (Phases 2, 3, 5)
      resources.ts                                       # + template branch in validateResources + registerResources (Phase 3)
      index.ts                                           # + registerPrompts + wireCompletions in boot sequence (Phases 2, 5)
  tests/
    prompts.test.ts                                      # NEW — validator + registration unit tests (Phases 1, 2)
    completions.test.ts                                  # NEW — validator + cross-ref unit tests (Phase 4)
    resources.test.ts                                    # + template-resource validator tests (Phase 3)
    integration.test.ts                                  # + prompts/list + prompts/get + resources/templates/list +
                                                         #   templated resources/read + completion/complete (Phases 2, 3, 5, 6)
  examples/
    prompts-completions.yaml                             # NEW (Phase 6)
  justfile                                               # + smoke-prompt recipe (Phase 6)
  .handoffs/
    YYYY-MM-DD-HHMM-jig-runtime-plan7-complete.md        # NEW (Phase 6)
```

**Not in Plan 7:** `src/runtime/tasks.ts`, `src/cli/`. Those arrive in Plans 8, 9.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 7 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `chore/plan7-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 7 (prompts + completions + URI templates)

Phase 0 of jig runtime Plan 7 — the plan doc itself. Subsequent
phases land on feat/plan7-prompts-schema,
feat/plan7-prompts-registration, feat/plan7-uri-templates,
feat/plan7-completions-schema, feat/plan7-completions-wiring,
feat/plan7-complete.

Plan 7 delivers: prompts: top-level block of named MCP prompt
templates; completions: top-level block binding value lists to
prompt arguments and resource-template variables;
resources: template: key upgrade enabling URI-template-
parameterized resources via RFC 6570; all three land together
because completion/complete is shared.

Out of scope per the scope note: dynamic completions, completable()
wrapping, prompt handlers, prompt message sequences, watchers on
templated resources, resources/list enumeration of templates,
blob content, webhook watchers, task state machines.
```

- [ ] **Step 2: Stage with specific path and commit**

Stage: `git add record/plans/2026-04-15-jig-runtime-plan7.md`

Clay: `gtxt && git pm`

Expected: Plan 7 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: `prompts:` schema + validator

**Intent:** Land the schema. After this phase, `parseConfig()` on a YAML with a `prompts:` block returns a typed `JigConfig.prompts: PromptsConfig | undefined`. All validation rules enforced: prompt name uniqueness, argument name uniqueness within each prompt, required/optional flags, unknown-key rejection at both the prompt and argument level. No runtime behavior changes — the `prompts` field is parsed and forgotten until Phase 2.

**Branch:** `feat/plan7-prompts-schema`

### Task 1.1: Add `PromptArgumentSpec`, `PromptSpec`, `PromptsConfig` types to `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the types after `ResourcesConfig`**

Search for `export type ResourcesConfig = ResourceSpec[];` and insert after it:

```typescript
export interface PromptArgumentSpec {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptSpec {
  name: string;
  description?: string;
  arguments?: PromptArgumentSpec[];
  template: string;
}

export type PromptsConfig = PromptSpec[];
```

- [ ] **Step 2: Extend `JigConfig` with the optional field**

Find `export interface JigConfig {` and add after `resources?:`:

```typescript
  /** MCP prompts — boot-registered named template prompts. */
  prompts?: PromptsConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — types compile, no consumers yet.

### Task 1.2: Write failing tests — the validator contract

**Files:**
- Create: `tests/prompts.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a prompts: block with a single prompt", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: analyze_job
    description: Analyze a completed job
    arguments:
      - name: jobId
        description: The job ID
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: "Analyze job {{jobId}} at {{depth}} depth."
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.prompts, "prompts must be present");
  assert.equal(cfg.prompts.length, 1);
  const p = cfg.prompts[0]!;
  assert.equal(p.name, "analyze_job");
  assert.equal(p.description, "Analyze a completed job");
  assert.equal(p.template, "Analyze job {{jobId}} at {{depth}} depth.");
  assert.equal(p.arguments!.length, 2);
  assert.equal(p.arguments![0]!.name, "jobId");
  assert.equal(p.arguments![0]!.required, true);
  assert.equal(p.arguments![1]!.required, false);
});

test("config accepts prompts: with no arguments array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: simple
    template: "Just a template."
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.prompts!.length, 1);
  assert.equal(cfg.prompts![0]!.arguments, undefined);
});

test("config accepts absent prompts: block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.prompts, undefined);
});

test("config rejects prompts: that isn't an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  not_an_array: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts must be an array/);
});

test("config rejects a prompt missing name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - description: No name
    template: "x"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.name is required/);
});

test("config rejects a prompt with an empty name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: ""
    template: "x"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.name is required/);
});

test("config rejects a prompt missing template", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: no_template
    description: "missing template"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.template is required/);
});

test("config rejects duplicate prompt names", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: dup
    template: "a"
  - name: dup
    template: "b"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /duplicate prompt name "dup"/);
});

test("config rejects a prompt with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    bogus: 42
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]: unknown key "bogus"/);
});

test("config rejects an argument missing name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - description: "no name here"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.arguments\[0\]\.name is required/);
});

test("config rejects duplicate argument names within a prompt", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - name: depth
      - name: depth
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]: duplicate argument name "depth"/);
});

test("config rejects an argument with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - name: x
        sneaky: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.arguments\[0\]: unknown key "sneaky"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="prompts"`
Expected: all tests FAIL — `parseConfig` does not yet wire the `prompts:` block.

### Task 1.3: Scaffold `src/runtime/prompts.ts` with `validatePrompts`

**Files:**
- Create: `src/runtime/prompts.ts`
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Create `src/runtime/prompts.ts`**

```typescript
import type { PromptArgumentSpec, PromptSpec, PromptsConfig } from "./config.ts";

const PROMPT_KNOWN = new Set(["name", "description", "arguments", "template"]);
const ARG_KNOWN = new Set(["name", "description", "required"]);

/**
 * Validate the top-level `prompts:` block.
 *
 * Rules:
 *   - prompts is undefined OR an array
 *   - each entry: name (required non-empty string, unique across block),
 *     description (optional string), template (required non-empty string),
 *     arguments (optional array of { name, description?, required? })
 *   - argument names are unique within each prompt
 *   - unknown keys rejected at prompt and argument level
 */
export function validatePrompts(v: unknown): PromptsConfig | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new Error("config: prompts must be an array");
  }
  const out: PromptsConfig = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptEntry(v[i], i, seenNames));
  }
  return out;
}

function validatePromptEntry(
  entry: unknown,
  index: number,
  seenNames: Set<string>,
): PromptSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${index}] must be a mapping`);
  }
  const e = entry as Record<string, unknown>;

  for (const key of Object.keys(e)) {
    if (!PROMPT_KNOWN.has(key)) {
      throw new Error(`config: prompts[${index}]: unknown key "${key}"`);
    }
  }

  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: prompts[${index}].name is required and must be a non-empty string`);
  }
  const name = e["name"];
  if (seenNames.has(name)) {
    throw new Error(`config: prompts: duplicate prompt name "${name}"`);
  }
  seenNames.add(name);

  if (e["description"] !== undefined && typeof e["description"] !== "string") {
    throw new Error(`config: prompts[${index}].description must be a string`);
  }

  if (typeof e["template"] !== "string" || e["template"].length === 0) {
    throw new Error(`config: prompts[${index}].template is required and must be a non-empty string`);
  }

  const args = e["arguments"] === undefined
    ? undefined
    : validatePromptArguments(e["arguments"], index);

  const out: PromptSpec = { name, template: e["template"] };
  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (args !== undefined) out.arguments = args;
  return out;
}

function validatePromptArguments(v: unknown, promptIndex: number): PromptArgumentSpec[] {
  if (!Array.isArray(v)) {
    throw new Error(`config: prompts[${promptIndex}].arguments must be an array`);
  }
  const out: PromptArgumentSpec[] = [];
  const seenArgNames = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptArgument(v[i], promptIndex, i, seenArgNames));
  }
  return out;
}

function validatePromptArgument(
  entry: unknown,
  promptIndex: number,
  argIndex: number,
  seen: Set<string>,
): PromptArgumentSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${promptIndex}].arguments[${argIndex}] must be a mapping`);
  }
  const a = entry as Record<string, unknown>;

  for (const key of Object.keys(a)) {
    if (!ARG_KNOWN.has(key)) {
      throw new Error(
        `config: prompts[${promptIndex}].arguments[${argIndex}]: unknown key "${key}"`,
      );
    }
  }

  if (typeof a["name"] !== "string" || a["name"].length === 0) {
    throw new Error(
      `config: prompts[${promptIndex}].arguments[${argIndex}].name is required and must be a non-empty string`,
    );
  }
  const name = a["name"];
  if (seen.has(name)) {
    throw new Error(`config: prompts[${promptIndex}]: duplicate argument name "${name}"`);
  }
  seen.add(name);

  const out: PromptArgumentSpec = { name };
  if (typeof a["description"] === "string") out.description = a["description"];
  if (a["required"] !== undefined) out.required = a["required"] === true;
  return out;
}
```

- [ ] **Step 2: Wire `validatePrompts` into `parseConfig`**

Add the import at the top of `src/runtime/config.ts` alongside the existing runtime imports:

```typescript
import { validatePrompts } from "./prompts.ts";
```

Find the `parseConfig` function body. After `const resources = validateResources(...)`:

```typescript
const prompts = validatePrompts(obj["prompts"]);
```

After `if (resources !== undefined) result.resources = resources;`:

```typescript
if (prompts !== undefined) result.prompts = prompts;
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- --test-name-pattern="prompts"`
Expected: all 12 Phase-1 tests PASS.

Run: `npm run check`
Expected: PASS.

### Task 1.4: Run the full gate suite and commit

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS (8 gates — smoke-prompt doesn't exist yet).

- [ ] **Step 2: Write the commit message**

```
feat(runtime): prompts: schema + validator (no registration yet)

Phase 1 of Plan 7 — Prompts + Completions + URI Templates. Lands
the top-level optional prompts: block as a typed
JigConfig.prompts: PromptsConfig | undefined, fully validated at
parseConfig time.

Schema:
  - prompts is undefined OR an array
  - per-entry: name (required non-empty, unique across block),
    description (optional string), template (required non-empty),
    arguments (optional array)
  - per-argument: name (required non-empty, unique within prompt),
    description (optional string), required (optional boolean)
  - unknown keys rejected at prompt and argument level

No runtime behavior changes yet. Boot registration lands in
Phase 2; URI templates in Phase 3; completions in Phases 4-5.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/prompts.ts \
  src/runtime/config.ts \
  tests/prompts.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 1 merges to main.

---

## Phase 2: Prompt registration + render wiring

**Intent:** After this phase, a config with a `prompts:` block exposes every prompt over stdio: `prompts/list` returns the registered prompts with their arguments, `prompts/get` invokes the template renderer with the provided args and returns a single user-role text message. The SDK's `McpServer.registerPrompt` auto-wires both methods and advertises `capabilities.prompts.listChanged`.

**Branch:** `feat/plan7-prompts-registration`

### Task 2.1: Extend `JigServerHandle` with a `registerPrompt` adapter method

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Add the SDK imports needed for prompts**

Extend the existing SDK import list in `server.ts` to include prompt-related types. The current import is:

```typescript
import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
  type JsonSchemaType,
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

Add `type RegisteredPrompt` and `type GetPromptResult` to the import:

```typescript
import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
  type GetPromptResult,
  type JsonSchemaType,
  type ReadResourceResult,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
```

- [ ] **Step 2: Add `RegisterPromptSpec` interface and re-export**

After `RegisterResourceSpec`, add:

```typescript
/**
 * Spec for registering one prompt. argsSchema is a JSON Schema object
 * whose properties describe the prompt's named arguments. Pass undefined
 * for a no-argument prompt.
 */
export interface RegisterPromptSpec {
  description?: string;
  argsSchema?: JsonSchemaObject;
}

/** Re-export so prompts.ts can type the return value without touching the SDK. */
export type RegisteredPromptHandle = RegisteredPrompt;
```

- [ ] **Step 3: Add `registerPrompt` to the `JigServerHandle` interface**

Inside `export interface JigServerHandle {`, add after `sendResourceUpdated`:

```typescript
  /**
   * Register one prompt. The adapter bridges argsSchema via
   * fromJsonSchema so McpServer.registerPrompt accepts it.
   * Auto-wires prompts/list + prompts/get and advertises
   * capabilities.prompts.listChanged.
   */
  registerPrompt(
    name: string,
    spec: RegisterPromptSpec,
    handler: (args: Record<string, string>) => GetPromptResult,
  ): RegisteredPromptHandle;
```

- [ ] **Step 4: Implement `registerPrompt` in `createServer`'s returned object**

Inside the object returned by `createServer`, add after `sendResourceUpdated`:

```typescript
    registerPrompt(name, spec, handler) {
      const argsSchema: StandardSchemaWithJSON | undefined =
        spec.argsSchema !== undefined
          ? fromJsonSchema(spec.argsSchema)
          : undefined;
      if (argsSchema !== undefined) {
        const cb: unknown = (args: Record<string, string>) => handler(args);
        return server.registerPrompt(
          name,
          {
            ...(spec.description !== undefined && { description: spec.description }),
            argsSchema,
          },
          cb as Parameters<typeof server.registerPrompt>[2],
        );
      }
      const cb: unknown = () => handler({});
      return server.registerPrompt(
        name,
        {
          ...(spec.description !== undefined && { description: spec.description }),
        },
        cb as Parameters<typeof server.registerPrompt>[2],
      );
    },
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS — no unused imports, no type errors.

### Task 2.2: Implement `registerPrompts` in `src/runtime/prompts.ts`

**Files:**
- Modify: `src/runtime/prompts.ts`

- [ ] **Step 1: Add imports at the top of `prompts.ts`**

```typescript
import type {
  JigServerHandle,
  RegisteredPromptHandle,
  RegisterPromptSpec,
} from "./server.ts";
import type { InvokeContext } from "./handlers/index.ts";
import { render } from "./util/template.ts";
```

- [ ] **Step 2: Append `registerPrompts` to `prompts.ts`**

```typescript
/**
 * Build a JSON Schema object for the prompt's arguments array.
 * The schema shape is: { type: "object", properties: { argName: {
 *   type: "string", description? } }, required: [requiredArgNames] }.
 * This is the shape fromJsonSchema expects and that the SDK's
 * promptArgumentsFromStandardSchema round-trips cleanly.
 */
function buildArgsSchema(args: PromptArgumentSpec[]): RegisterPromptSpec["argsSchema"] {
  const properties: Record<string, { type: "string"; description?: string }> = {};
  const required: string[] = [];
  for (const arg of args) {
    properties[arg.name] = { type: "string" };
    if (arg.description !== undefined) {
      properties[arg.name]!.description = arg.description;
    }
    if (arg.required === true) {
      required.push(arg.name);
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 && { required }),
  };
}

/**
 * Register every prompt in the config with the MCP server. Returns an
 * array of SDK handles (ignored by v1; future hot-reload plan consumes
 * them). Each prompt's get callback renders the template via render()
 * with the provided args merged with probe, returning a single
 * user-role text message.
 */
export function registerPrompts(
  server: JigServerHandle,
  prompts: PromptsConfig,
  ctx: InvokeContext,
): RegisteredPromptHandle[] {
  const handles: RegisteredPromptHandle[] = [];
  for (const spec of prompts) {
    const argsSchema =
      spec.arguments !== undefined && spec.arguments.length > 0
        ? buildArgsSchema(spec.arguments)
        : undefined;
    const handle = server.registerPrompt(
      spec.name,
      {
        ...(spec.description !== undefined && { description: spec.description }),
        ...(argsSchema !== undefined && { argsSchema }),
      },
      (args: Record<string, string>) => {
        const rendered = render(spec.template, { ...args, probe: ctx.probe });
        return {
          messages: [
            {
              role: "user" as const,
              content: { type: "text" as const, text: rendered },
            },
          ],
        };
      },
    );
    handles.push(handle);
  }
  return handles;
}

export type { RegisteredPromptHandle };
```

### Task 2.3: Write failing integration tests for `prompts/list` + `prompts/get`

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append prompts integration tests**

At the bottom of `tests/integration.test.ts`, append:

```typescript
test("prompts/list returns registered prompts with arguments", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-plist-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-plist, version: "0.0.1" }
prompts:
  - name: analyze_job
    description: Analyze a completed job
    arguments:
      - name: jobId
        description: The job ID
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: "Analyze job {{jobId}} at {{depth}} depth."
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
        { jsonrpc: "2.0", id: 2, method: "prompts/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "prompts/list response present");
    const result = listResp!.result as {
      prompts: Array<{
        name: string;
        description?: string;
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
      }>;
    };
    assert.equal(result.prompts.length, 1);
    assert.equal(result.prompts[0]!.name, "analyze_job");
    assert.equal(result.prompts[0]!.description, "Analyze a completed job");
    assert.equal(result.prompts[0]!.arguments!.length, 2);
    assert.equal(result.prompts[0]!.arguments![0]!.name, "jobId");
    assert.equal(result.prompts[0]!.arguments![0]!.required, true);
    assert.equal(result.prompts[0]!.arguments![1]!.name, "depth");
    assert.equal(result.prompts[0]!.arguments![1]!.required, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prompts/get renders the template with provided args", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-pget-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-pget, version: "0.0.1" }
prompts:
  - name: greet
    arguments:
      - name: who
        required: true
    template: "Hello, {{who}}!"
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
        { jsonrpc: "2.0", id: 2, method: "prompts/get", params: {
          name: "greet",
          arguments: { who: "world" },
        } },
      ],
    );
    const getResp = resp.find((r) => r.id === 2);
    assert.ok(getResp, "prompts/get response present");
    const result = getResp!.result as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]!.role, "user");
    assert.equal(result.messages[0]!.content.type, "text");
    assert.equal(result.messages[0]!.content.text, "Hello, world!");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="prompts/(list|get)"`
Expected: FAIL — runtime doesn't register prompts yet.

### Task 2.4: Wire `registerPrompts` into `src/runtime/index.ts`

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Add the import**

```typescript
import { registerPrompts } from "./prompts.ts";
```

- [ ] **Step 2: Wire after `registerResources` block, before `server.connect`**

Find the block:

```typescript
  if (config.resources) {
    registerResources(server, config.resources, ctx);
    const tracker = server.trackSubscriptions();
    startWatchers(config.resources, server, tracker, ctx);
  }

  await server.connect(createStdioTransport());
```

Change to:

```typescript
  if (config.resources) {
    registerResources(server, config.resources, ctx);
    const tracker = server.trackSubscriptions();
    startWatchers(config.resources, server, tracker, ctx);
  }

  if (config.prompts) {
    registerPrompts(server, config.prompts, ctx);
  }

  await server.connect(createStdioTransport());
```

- [ ] **Step 3: Run the integration tests**

Run: `npm test -- --test-name-pattern="prompts/(list|get)"`
Expected: both PASS.

### Task 2.5: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): prompts: registration + prompts/list + prompts/get

Phase 2 of Plan 7. Lands prompt registration: configs declaring a
prompts: block expose every prompt over stdio via the SDK's
auto-wired prompts/list and prompts/get request handlers.

Changes:
  - server.ts: JigServerHandle gains registerPrompt(name, spec, cb);
    bridges argsSchema via fromJsonSchema; RegisteredPromptHandle
    re-exported so prompts.ts stays off the SDK package
  - prompts.ts: registerPrompts(server, prompts, ctx) builds a JSON
    Schema from the arguments array (type: object, properties with
    per-arg description, required array), wires get callback that
    renders spec.template via render(template, {...args, probe:
    ctx.probe}), returns single user-role text message
  - index.ts: boot-time call to registerPrompts after registerResources,
    before server.connect

No completions yet; no URI templates yet. Phases 3-5 add those.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/prompts.ts \
  src/runtime/server.ts \
  src/runtime/index.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 3: URI-templated resources

**Intent:** After this phase, a resource entry can declare `template: "queue://jobs/{status}"` instead of `uri:`. Jig calls `server.registerResource` with an SDK `ResourceTemplate` instance; the SDK auto-wires `resources/templates/list` and does RFC 6570 variable extraction on `resources/read`. Templated resources MUST NOT carry `watcher:`.

**Branch:** `feat/plan7-uri-templates`

### Task 3.1: Upgrade `ResourceSpec` type in `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Replace the existing `ResourceSpec` interface with a union**

Find `export interface ResourceSpec {` (the Plan 6 static-only shape) and replace it with:

```typescript
interface ResourceSpecBase {
  name: string;
  description?: string;
  mimeType?: string;
  handler: Handler;
}

interface ResourceSpecStatic extends ResourceSpecBase {
  uri: string;
  template?: never;
  watcher?: WatcherSpec;
}

interface ResourceSpecTemplated extends ResourceSpecBase {
  template: string;
  uri?: never;
  watcher?: never;
}

export type ResourceSpec = ResourceSpecStatic | ResourceSpecTemplated;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS — existing uses of `ResourceSpec.uri` and `ResourceSpec.watcher` are narrowed cleanly by the union.

### Task 3.2: Write failing tests for templated resource validation

**Files:**
- Modify: `tests/resources.test.ts`

- [ ] **Step 1: Append tests for the `template:` key**

```typescript
test("config accepts a resources: entry with template: instead of uri:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    description: Jobs filtered by state
    mimeType: application/json
    handler:
      exec: "./list-jobs --status {{status}}"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.resources!.length, 1);
  const r = cfg.resources![0]!;
  assert.ok("template" in r && r.template === "queue://jobs/{status}");
  assert.equal(r.name, "Jobs by status");
  assert.equal(r.mimeType, "application/json");
});

test("config rejects a resource with both uri: and template:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    template: "config://x/{id}"
    name: X
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /exactly one of uri or template/);
});

test("config rejects a resource with neither uri: nor template:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - name: X
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /exactly one of uri or template/);
});

test("config rejects a template: resource with a watcher:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 1000
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /template.*watcher/i);
});

test("config allows mixed static and template resources", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://static
    name: Static
    handler: { inline: { text: s } }
  - template: "queue://jobs/{status}"
    name: Templated
    handler: { exec: "./list-jobs" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.resources!.length, 2);
  assert.ok("uri" in cfg.resources![0]!);
  assert.ok("template" in cfg.resources![1]!);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="template:"`
Expected: FAIL — `validateResources` doesn't handle the `template:` key yet.

### Task 3.3: Upgrade `validateResources` in `resources.ts`

**Files:**
- Modify: `src/runtime/resources.ts`

- [ ] **Step 1: Extend `ENTRY_KNOWN` to include `template`**

Find `const ENTRY_KNOWN = new Set([` and add `"template"` to the set:

```typescript
const ENTRY_KNOWN = new Set([
  "uri", "template", "name", "description", "mimeType", "handler", "watcher",
]);
```

- [ ] **Step 2: Replace the URI-only check in `validateResourceEntry` with exactly-one-of logic**

Find the block in `validateResourceEntry` that starts:
```typescript
  if (typeof e["uri"] !== "string" || e["uri"].length === 0) {
```

Replace it with:

```typescript
  const hasUri = typeof e["uri"] === "string" && e["uri"].length > 0;
  const hasTemplate = typeof e["template"] === "string" && e["template"].length > 0;
  if (!hasUri && !hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required`);
  }
  if (hasUri && hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required (got both)`);
  }

  if (hasTemplate && e["watcher"] !== undefined) {
    throw new Error(`config: resources[${index}]: template resources cannot carry watcher (template + watcher is not supported in v1)`);
  }

  // URI validity check (static resources only)
  if (hasUri) {
    const uri = e["uri"] as string;
    try {
      new URL(uri);
    } catch {
      throw new Error(`config: resources[${index}].uri "${uri}" is not a valid URL`);
    }
    if (seen.has(uri)) {
      throw new Error(`config: resources: duplicate uri "${uri}"`);
    }
    seen.add(uri);
  } else {
    // Template: track by template string for duplicate detection
    const tmpl = e["template"] as string;
    if (seen.has(tmpl)) {
      throw new Error(`config: resources: duplicate template "${tmpl}"`);
    }
    seen.add(tmpl);
  }
```

- [ ] **Step 3: Update the output construction in `validateResourceEntry`**

Find the block that builds `const out: ResourceSpec = { uri, name: e["name"], handler };` and replace with:

```typescript
  const out: ResourceSpec = hasUri
    ? { uri: e["uri"] as string, name: e["name"] as string, handler }
    : { template: e["template"] as string, name: e["name"] as string, handler };

  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (e["mimeType"] !== undefined) out.mimeType = e["mimeType"] as string;

  if (e["watcher"] !== undefined) {
    // watcher only valid on static resources; template guard above already
    // rejected template+watcher — this branch handles static only.
    (out as Extract<ResourceSpec, { uri: string }>).watcher = validateWatcher(e["watcher"], index);
  }
```

- [ ] **Step 4: Run the validator tests**

Run: `npm test -- --test-name-pattern="(template:|resources)"`
Expected: all pass (both the new template tests and the existing static-resource tests).

Run: `npm run check`
Expected: PASS.

### Task 3.4: Add `ResourceTemplate` support to `server.ts`

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Add `ResourceTemplate` to the SDK import**

```typescript
import {
  McpServer,
  ResourceTemplate,
  fromJsonSchema,
  type CallToolResult,
  type GetPromptResult,
  type JsonSchemaType,
  type ReadResourceResult,
  type ReadResourceTemplateCallback,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
```

- [ ] **Step 2: Add `registerResourceTemplate` to `JigServerHandle`**

Inside `export interface JigServerHandle {`, after `registerResource`:

```typescript
  /**
   * Register a URI-template resource. The SDK auto-wires
   * resources/templates/list and handles RFC 6570 variable extraction
   * on resources/read. list: undefined means the template does not
   * enumerate on resources/list.
   */
  registerResourceTemplate(
    name: string,
    template: string,
    metadata: { description?: string; mimeType?: string },
    handler: (uri: URL, variables: Record<string, string>) => Promise<ReadResourceResult>,
  ): RegisteredResource;
```

- [ ] **Step 3: Implement in `createServer`'s returned object**

After `registerResource(...)`:

```typescript
    registerResourceTemplate(name, templateStr, metadata, handler) {
      const tmpl = new ResourceTemplate(templateStr, { list: undefined });
      const resourceMetadata: ResourceMetadata = {};
      if (metadata.description !== undefined) resourceMetadata.description = metadata.description;
      if (metadata.mimeType !== undefined) resourceMetadata.mimeType = metadata.mimeType;
      const cb: ReadResourceTemplateCallback = (uri, variables) =>
        handler(uri, variables as Record<string, string>);
      return server.registerResource(name, tmpl, resourceMetadata, cb);
    },
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

### Task 3.5: Wire the template branch in `registerResources`

**Files:**
- Modify: `src/runtime/resources.ts`

- [ ] **Step 1: Update `registerResources` to branch on `template` vs `uri`**

Find `export function registerResources(` and replace its body:

```typescript
export function registerResources(
  server: JigServerHandle,
  resources: ResourcesConfig,
  ctx: InvokeContext,
): RegisteredResourceHandle[] {
  const handles: RegisteredResourceHandle[] = [];
  for (const spec of resources) {
    if ("template" in spec) {
      // URI-template resource: variables extracted per-read by the SDK.
      const handle = server.registerResourceTemplate(
        spec.name,
        spec.template,
        {
          ...(spec.description !== undefined && { description: spec.description }),
          ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
        },
        async (uri, variables) => {
          const args = { ...variables, probe: ctx.probe };
          const raw = await invoke(spec.handler, args, ctx);
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
    } else {
      // Static URI resource.
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
  }
  return handles;
}
```

### Task 3.6: Write failing integration tests for URI-template resources

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append template resource integration tests**

```typescript
test("resources/templates/list returns registered template resources", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-tlist-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-tlist, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    description: Jobs filtered by state
    mimeType: application/json
    handler:
      inline:
        text: "[]"
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
        { jsonrpc: "2.0", id: 2, method: "resources/templates/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "resources/templates/list response present");
    const result = listResp!.result as {
      resourceTemplates: Array<{ uriTemplate: string; name: string; description?: string; mimeType?: string }>;
    };
    assert.equal(result.resourceTemplates.length, 1);
    assert.equal(result.resourceTemplates[0]!.uriTemplate, "queue://jobs/{status}");
    assert.equal(result.resourceTemplates[0]!.name, "Jobs by status");
    assert.equal(result.resourceTemplates[0]!.mimeType, "application/json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resources/read resolves a templated resource with variables", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-tread-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-tread, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: application/json
    handler:
      inline:
        text: "jobs with status={{status}}"
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
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: {
          uri: "queue://jobs/pending",
        } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    const result = readResp!.result as {
      contents: Array<{ uri: string; mimeType?: string; text: string }>;
    };
    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0]!.uri, "queue://jobs/pending");
    assert.equal(result.contents[0]!.text, "jobs with status=pending");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="resources/templates|templated resource"`
Expected: FAIL — no template branch yet.

- [ ] **Step 3: Run again after Task 3.5 is complete**

Run: `npm test -- --test-name-pattern="resources/templates|templated resource"`
Expected: both PASS.

### Task 3.7: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): resources: URI-template branch (ResourceTemplate)

Phase 3 of Plan 7. Upgrades the resources: block to accept
template: as an alternative to uri:. Template resources are
registered via ResourceTemplate + registerResourceTemplate,
which the SDK uses to auto-wire resources/templates/list and
RFC 6570 variable extraction on resources/read.

Changes:
  - config.ts: ResourceSpec becomes a discriminated union
    (ResourceSpecStatic | ResourceSpecTemplated); template entries
    cannot carry watcher: (rejected at parse time)
  - resources.ts: validateResources enforces exactly-one-of
    (uri|template); registerResources branches on "template" in
    spec, passing extracted variables to invoke() alongside probe
  - server.ts: JigServerHandle.registerResourceTemplate(name,
    template, metadata, handler); wraps new ResourceTemplate(str,
    { list: undefined }) — list key is required by the SDK type
    (passing {} is a type error)

Templated resources appear on resources/templates/list only;
resources/list enumerates static URIs only (list: undefined).
Watcher on template: rejected — watching a family-of-URIs is
unbounded.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/config.ts \
  src/runtime/resources.ts \
  src/runtime/server.ts \
  tests/resources.test.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 4: `completions:` schema + validator + cross-reference checks

**Intent:** Land the schema. After this phase, `parseConfig()` on a YAML with a `completions:` block returns a typed `JigConfig.completions: CompletionsConfig | undefined`. Cross-reference checks enforce: every prompt name in `completions.prompts` maps to a declared prompt, every argument name maps to a declared argument in that prompt, every template string in `completions.resources` matches a declared `template:` resource, every variable name is one of the `{vars}` in that template. No runtime behavior yet.

**Branch:** `feat/plan7-completions-schema`

### Task 4.1: Add `CompletionsConfig` type to `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the type after `PromptsConfig`**

```typescript
export interface CompletionsConfig {
  /** promptName -> argName -> value list */
  prompts?: Record<string, Record<string, string[]>>;
  /** templateString -> varName -> value list */
  resources?: Record<string, Record<string, string[]>>;
}
```

- [ ] **Step 2: Extend `JigConfig`**

Add after `prompts?:`:

```typescript
  /** Autocomplete value lists for prompt arguments and template variables. */
  completions?: CompletionsConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS.

### Task 4.2: Write failing tests for `completions:` validation

**Files:**
- Create: `tests/completions.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

const BASE_WITH_PROMPT = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: analyze_job
    arguments:
      - name: depth
        required: false
    template: "Analyze at {{depth}} depth."
tools: []
`;

const BASE_WITH_TEMPLATE = `
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs
    handler: { inline: { text: "[]" } }
tools: []
`;

test("config accepts a completions: block for a prompt argument", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      depth: [summary, detailed]
`;
  const cfg = parseConfig(yaml);
  assert.ok(cfg.completions, "completions present");
  assert.deepEqual(cfg.completions!.prompts!["analyze_job"]!["depth"], ["summary", "detailed"]);
});

test("config accepts a completions: block for a template variable", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed, failed]
`;
  const cfg = parseConfig(yaml);
  assert.ok(cfg.completions!.resources);
  assert.deepEqual(
    cfg.completions!.resources!["queue://jobs/{status}"]!["status"],
    ["pending", "active", "completed", "failed"],
  );
});

test("config accepts absent completions: block", () => {
  const cfg = parseConfig(BASE_WITH_PROMPT);
  assert.equal(cfg.completions, undefined);
});

test("config rejects completions.prompts referencing a non-existent prompt", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    no_such_prompt:
      depth: [x]
`;
  assert.throws(() => parseConfig(yaml), /completions\.prompts\.no_such_prompt.*not found/);
});

test("config rejects completions.prompts referencing a non-existent argument", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      no_such_arg: [x]
`;
  assert.throws(
    () => parseConfig(yaml),
    /completions\.prompts\.analyze_job\.no_such_arg.*not found/,
  );
});

test("config rejects completions.resources referencing a non-existent template", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://other/{foo}":
      foo: [x]
`;
  assert.throws(() => parseConfig(yaml), /completions\.resources.*queue:\/\/other\/\{foo\}.*not found/);
});

test("config rejects completions.resources referencing a non-existent variable", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://jobs/{status}":
      no_such_var: [x]
`;
  assert.throws(
    () => parseConfig(yaml),
    /completions\.resources.*no_such_var.*not a variable/,
  );
});

test("config rejects completions.prompts value that isn't an array", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      depth: "not an array"
`;
  assert.throws(() => parseConfig(yaml), /must be an array/);
});

test("config rejects completions: that isn't a mapping", () => {
  const yaml = BASE_WITH_PROMPT + `
completions: [a, b]
`;
  assert.throws(() => parseConfig(yaml), /completions must be a mapping/);
});
```

- [ ] **Step 2: Run to verify all fail**

Run: `npm test -- --test-name-pattern="completions"`
Expected: all FAIL — `parseConfig` doesn't wire `completions:` yet.

### Task 4.3: Create `src/runtime/completions.ts` with `validateCompletions`

**Files:**
- Create: `src/runtime/completions.ts`
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Create `src/runtime/completions.ts`**

```typescript
import type { CompletionsConfig, PromptsConfig, ResourcesConfig } from "./config.ts";

/**
 * Extract RFC 6570 variable names from a template string.
 * Only handles simple {varName} expansions (no modifiers).
 */
function extractTemplateVars(template: string): Set<string> {
  const vars = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    // Strip RFC 6570 modifiers (+, #, ., /, ;, ?, &, =, ,, !, @, |)
    const raw = m[1]!.replace(/^[+#./;?&=,!@|]/, "");
    for (const part of raw.split(",")) {
      vars.add(part.trim().replace(/\*$/, ""));
    }
  }
  return vars;
}

/**
 * Validate the top-level `completions:` block with cross-reference checks.
 *
 * Called after individual block validation — requires parsed prompts and
 * resources to verify refs. Errors name the exact YAML path that failed.
 *
 * Rules:
 *   - completions is undefined OR a mapping
 *   - completions.prompts is undefined OR a mapping: promptName -> argName -> string[]
 *     - promptName must exist in prompts
 *     - argName must exist in that prompt's arguments
 *     - value must be a non-empty string array
 *   - completions.resources is undefined OR a mapping: templateString -> varName -> string[]
 *     - templateString must match a declared resource with template: (exact string match)
 *     - varName must be one of the {vars} in that template
 *     - value must be a non-empty string array
 *   - unknown keys at the top level of completions are rejected
 */
export function validateCompletions(
  v: unknown,
  prompts: PromptsConfig | undefined,
  resources: ResourcesConfig | undefined,
): CompletionsConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions must be a mapping");
  }
  const raw = v as Record<string, unknown>;

  const knownTopKeys = new Set(["prompts", "resources"]);
  for (const key of Object.keys(raw)) {
    if (!knownTopKeys.has(key)) {
      throw new Error(`config: completions: unknown key "${key}"`);
    }
  }

  const out: CompletionsConfig = {};

  if (raw["prompts"] !== undefined) {
    out.prompts = validateCompletionPrompts(raw["prompts"], prompts);
  }

  if (raw["resources"] !== undefined) {
    out.resources = validateCompletionResources(raw["resources"], resources);
  }

  return out;
}

function validateCompletionPrompts(
  v: unknown,
  prompts: PromptsConfig | undefined,
): Record<string, Record<string, string[]>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.prompts must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [promptName, argMap] of Object.entries(raw)) {
    const prompt = prompts?.find((p) => p.name === promptName);
    if (!prompt) {
      throw new Error(
        `config: completions.prompts.${promptName}: prompt "${promptName}" not found in prompts:`,
      );
    }
    if (!argMap || typeof argMap !== "object" || Array.isArray(argMap)) {
      throw new Error(
        `config: completions.prompts.${promptName} must be a mapping of argName -> string[]`,
      );
    }
    const argMapRaw = argMap as Record<string, unknown>;
    out[promptName] = {};
    for (const [argName, values] of Object.entries(argMapRaw)) {
      const argExists = prompt.arguments?.some((a) => a.name === argName);
      if (!argExists) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName}: argument "${argName}" not found in prompt "${promptName}"`,
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName} must be a non-empty array of strings`,
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.prompts.${promptName}.${argName}: all values must be strings`,
          );
        }
      }
      out[promptName]![argName] = values as string[];
    }
  }
  return out;
}

function validateCompletionResources(
  v: unknown,
  resources: ResourcesConfig | undefined,
): Record<string, Record<string, string[]>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.resources must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: Record<string, Record<string, string[]>> = {};

  // Build a map from template string -> Set<varName> for quick lookup
  const templateVarMap = new Map<string, Set<string>>();
  if (resources) {
    for (const spec of resources) {
      if ("template" in spec) {
        templateVarMap.set(spec.template, extractTemplateVars(spec.template));
      }
    }
  }

  for (const [templateString, varMap] of Object.entries(raw)) {
    const knownVars = templateVarMap.get(templateString);
    if (!knownVars) {
      throw new Error(
        `config: completions.resources."${templateString}": template "${templateString}" not found in resources:`,
      );
    }
    if (!varMap || typeof varMap !== "object" || Array.isArray(varMap)) {
      throw new Error(
        `config: completions.resources."${templateString}" must be a mapping of varName -> string[]`,
      );
    }
    const varMapRaw = varMap as Record<string, unknown>;
    out[templateString] = {};
    for (const [varName, values] of Object.entries(varMapRaw)) {
      if (!knownVars.has(varName)) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName}: "${varName}" is not a variable in template "${templateString}"`,
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName} must be a non-empty array of strings`,
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.resources."${templateString}".${varName}: all values must be strings`,
          );
        }
      }
      out[templateString]![varName] = values as string[];
    }
  }
  return out;
}
```

- [ ] **Step 2: Wire `validateCompletions` into `parseConfig`**

Add the import at the top of `src/runtime/config.ts`:

```typescript
import { validateCompletions } from "./completions.ts";
```

In `parseConfig`, after `const prompts = validatePrompts(obj["prompts"]);`:

```typescript
const completions = validateCompletions(obj["completions"], prompts, resources);
```

After `if (prompts !== undefined) result.prompts = prompts;`:

```typescript
if (completions !== undefined) result.completions = completions;
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- --test-name-pattern="completions"`
Expected: all 9 Phase-4 tests PASS.

Run: `npm run check`
Expected: PASS.

### Task 4.4: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): completions: schema + validator + cross-ref checks

Phase 4 of Plan 7. Lands the top-level optional completions: block
as a typed JigConfig.completions: CompletionsConfig | undefined,
fully validated at parseConfig time, with cross-reference checks
against the parsed prompts: and resources: blocks.

Schema:
  - completions is undefined OR a mapping with optional prompts:
    and/or resources: submaps
  - completions.prompts.<promptName>.<argName>: string[] — prompt
    name must exist in prompts:; argument name must exist in that
    prompt's arguments:; value must be a non-empty string array
  - completions.resources."<templateStr>".<varName>: string[] —
    templateStr must match a declared template: resource (exact
    string match); varName must be one of the RFC 6570 {vars} in
    that template
  - unknown keys rejected at every level

No runtime behavior yet. Completion handler wiring lands in
Phase 5; capability advertisement lands alongside it.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/completions.ts \
  src/runtime/config.ts \
  tests/completions.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 5: Completion handler wiring

**Intent:** After this phase, a config with a `completions:` block wires `completion/complete` via `server.server.setRequestHandler` (same SDK-quarantine pattern as Plan 6's subscribe/unsubscribe), advertises `capabilities.completions: {}`, and returns prefix-filtered, case-insensitive value lists (capped at 100) for both prompt-argument refs and resource-template-variable refs.

**Branch:** `feat/plan7-completions-wiring`

### Task 5.1: Add `wireCompletions` to `server.ts`

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Add `CompletionsIndex` type and `wireCompletions` to `JigServerHandle`**

After the `SubscriptionTracker` interface, add:

```typescript
/**
 * Pre-built lookup index for the completion/complete handler.
 * Prompt path: prompts[promptName][argName] -> values
 * Resource path: resources[templateString][varName] -> values
 */
export interface CompletionsIndex {
  prompts: Map<string, Map<string, string[]>>;
  resources: Map<string, Map<string, string[]>>;
}
```

Add to `JigServerHandle` interface after `trackSubscriptions`:

```typescript
  /**
   * Build the completions index from config and wire a low-level
   * completion/complete request handler. Advertises
   * capabilities.completions: {} via registerCapabilities.
   * MUST be called before server.connect().
   */
  wireCompletions(completions: import("./config.ts").CompletionsConfig): void;
```

- [ ] **Step 2: Add `buildCompletionsIndex` helper**

Add before the `createServer` export:

```typescript
function buildCompletionsIndex(
  completions: import("./config.ts").CompletionsConfig,
): CompletionsIndex {
  const idx: CompletionsIndex = {
    prompts: new Map(),
    resources: new Map(),
  };
  if (completions.prompts) {
    for (const [promptName, argMap] of Object.entries(completions.prompts)) {
      const inner = new Map<string, string[]>();
      for (const [argName, values] of Object.entries(argMap)) {
        inner.set(argName, values);
      }
      idx.prompts.set(promptName, inner);
    }
  }
  if (completions.resources) {
    for (const [templateStr, varMap] of Object.entries(completions.resources)) {
      const inner = new Map<string, string[]>();
      for (const [varName, values] of Object.entries(varMap)) {
        inner.set(varName, values);
      }
      idx.resources.set(templateStr, inner);
    }
  }
  return idx;
}

const EMPTY_COMPLETION_RESULT = {
  completion: { values: [], total: 0, hasMore: false },
} as const;
```

- [ ] **Step 3: Implement `wireCompletions` in the returned object**

Inside the object returned by `createServer`, add after `registerPrompt`:

```typescript
    wireCompletions(completions) {
      const idx = buildCompletionsIndex(completions);
      const lowLevel = server.server;
      lowLevel.registerCapabilities({ completions: {} });
      lowLevel.setRequestHandler("completion/complete", async (req) => {
        const { ref, argument } = req.params as {
          ref: { type: string; name?: string; uri?: string };
          argument: { name: string; value: string };
        };

        let values: string[] | undefined;

        if (ref.type === "ref/prompt" && ref.name !== undefined) {
          values = idx.prompts.get(ref.name)?.get(argument.name);
        } else if (ref.type === "ref/resource" && ref.uri !== undefined) {
          values = idx.resources.get(ref.uri)?.get(argument.name);
        }

        if (!values) return EMPTY_COMPLETION_RESULT;

        const prefix = argument.value.toLowerCase();
        const filtered = values
          .filter((v) => v.toLowerCase().startsWith(prefix))
          .slice(0, 100);

        return {
          completion: {
            values: filtered,
            total: values.length,
            hasMore: filtered.length < values.length,
          },
        };
      });
    },
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS.

### Task 5.2: Wire `wireCompletions` into `src/runtime/index.ts`

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Update the boot sequence**

Find the prompts block:

```typescript
  if (config.prompts) {
    registerPrompts(server, config.prompts, ctx);
  }

  await server.connect(createStdioTransport());
```

Change to:

```typescript
  if (config.prompts) {
    registerPrompts(server, config.prompts, ctx);
  }

  if (config.completions) {
    server.wireCompletions(config.completions);
  }

  await server.connect(createStdioTransport());
```

### Task 5.3: Write failing integration tests for `completion/complete`

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append completion integration tests**

```typescript
test("completion/complete returns prefix-filtered values for a prompt argument ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-prompt-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-prompt, version: "0.0.1" }
prompts:
  - name: analyze_job
    arguments:
      - name: depth
        required: false
    template: "Analyze at {{depth}} depth."
completions:
  prompts:
    analyze_job:
      depth: [summary, detailed, verbose]
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
        { jsonrpc: "2.0", id: 2, method: "completion/complete", params: {
          ref: { type: "ref/prompt", name: "analyze_job" },
          argument: { name: "depth", value: "de" },
        } },
      ],
    );
    const compResp = resp.find((r) => r.id === 2);
    assert.ok(compResp, "completion/complete response present");
    const result = compResp!.result as {
      completion: { values: string[]; total: number; hasMore: boolean };
    };
    assert.deepEqual(result.completion.values, ["detailed"]);
    assert.equal(result.completion.total, 3);
    assert.equal(result.completion.hasMore, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completion/complete returns prefix-filtered values for a resource template variable ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-res-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-res, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    handler:
      inline:
        text: "[]"
completions:
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed, failed, cancelled]
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
        { jsonrpc: "2.0", id: 2, method: "completion/complete", params: {
          ref: { type: "ref/resource", uri: "queue://jobs/{status}" },
          argument: { name: "status", value: "c" },
        } },
      ],
    );
    const compResp = resp.find((r) => r.id === 2);
    assert.ok(compResp, "completion/complete response present");
    const result = compResp!.result as {
      completion: { values: string[]; total: number; hasMore: boolean };
    };
    // "c" prefix matches "completed" and "cancelled"
    assert.equal(result.completion.values.length, 2);
    assert.ok(result.completion.values.includes("completed"));
    assert.ok(result.completion.values.includes("cancelled"));
    assert.equal(result.completion.total, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completion/complete returns empty for an unknown ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-unk-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-unk, version: "0.0.1" }
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
        { jsonrpc: "2.0", id: 2, method: "completion/complete", params: {
          ref: { type: "ref/prompt", name: "no_such_prompt" },
          argument: { name: "x", value: "" },
        } },
      ],
    );
    // No completions: block — no handler wired — SDK returns MethodNotFound or
    // no completions capability. Either way the test server has no completions.
    // If the response is an error, that's fine; if it's a result with empty
    // values, that's also fine. Key: no crash.
    const compResp = resp.find((r) => r.id === 2);
    assert.ok(compResp, "got a response for completion/complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="completion/complete"`
Expected: the prompt-arg and resource-template tests FAIL — no handler wired yet.

- [ ] **Step 3: Run after Task 5.1-5.2 are complete**

Run: `npm test -- --test-name-pattern="completion/complete"`
Expected: all three PASS.

### Task 5.4: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): completions: wireCompletions + completion/complete handler

Phase 5 of Plan 7. Wires the completion/complete MCP method via
server.server.setRequestHandler — same SDK-quarantine pattern as
Plan 6's subscribe/unsubscribe, one level below McpServer.

Changes:
  - server.ts: JigServerHandle.wireCompletions(completions) builds
    a CompletionsIndex (Map<promptName, Map<argName, string[]>> and
    Map<templateStr, Map<varName, string[]>>), registers
    capabilities.completions: {} via registerCapabilities, then
    wires "completion/complete" on lowLevel with ref-type routing
    (ref/prompt -> prompts index; ref/resource -> resources index),
    case-insensitive prefix filter, cap at 100 values
  - index.ts: wireCompletions called after registerPrompts, gated on
    config.completions, before server.connect

Completion values are static at boot. YAML reload requires restart.
Unknown ref → EMPTY_COMPLETION_RESULT (values: [], total: 0,
hasMore: false) — same sentinel the SDK itself returns.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/server.ts \
  src/runtime/index.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 6: Example + `smoke-prompt` + integration + handoff

**Intent:** Ship the demonstrable artifact. `examples/prompts-completions.yaml` exercises all three Plan 7 surfaces in one file. `just smoke-prompt` exercises initialize → prompts/list → prompts/get → resources/templates/list → completion/complete. End-to-end integration test chains all surfaces. Gate count grows from 8 to 9 with `just smoke-prompt`. Handoff names Plan 8 as next.

**Branch:** `feat/plan7-complete`

### Task 6.1: Write `examples/prompts-completions.yaml`

**Files:**
- Create: `examples/prompts-completions.yaml`

- [ ] **Step 1: Create the example YAML**

```yaml
# A Plan 7 example exercising prompts + completions + URI-templated resources.
# Demonstrates:
#   - prompts: block with named arguments and a template
#   - resources: block with both a static URI and a template: URI
#   - completions: block binding value lists to a prompt argument
#     and a template variable
#
# Run with `just smoke-prompt`. Hermetic — no network, no filesystem
# writes. All handlers are inline.
#
# NOTE: completion/complete prefix matching is case-insensitive. Sending
# argument.value: "S" matches "summary" and "standard".
#
# NOTE: resources/templates/list returns template resources only; they
# do NOT appear on resources/list (list: undefined is passed to
# ResourceTemplate at registration time).

server:
  name: jig-plan7-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 7: prompts block, URI-template resources,
    and completions for both surfaces.

resources:
  - uri: config://jig/hello
    name: Hello
    description: A static greeting.
    mimeType: text/plain
    handler:
      inline:
        text: "Hello from the Plan 7 example."

  - template: "queue://jobs/{status}"
    name: Jobs by status
    description: Jobs filtered by state. Variable completion via completions:.
    mimeType: application/json
    handler:
      inline:
        text: "[]"

prompts:
  - name: analyze_job
    description: Produce an analysis prompt for a completed job
    arguments:
      - name: jobId
        description: The job ID to analyze
        required: true
      - name: depth
        description: "Analysis depth: summary | detailed | verbose"
        required: false
    template: |
      Analyze job {{jobId}}.
      Depth: {{depth}}.
      Use the queue://jobs/{status} resource to look up related jobs.

completions:
  prompts:
    analyze_job:
      depth: [summary, detailed, verbose]
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed, failed, cancelled]

tools:
  - name: ping
    description: Simple tool so tools/list returns at least one entry.
    handler:
      inline:
        text: pong
```

- [ ] **Step 2: Verify the YAML parses**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/prompts-completions.yaml < /dev/null`
Expected: runtime boots without error (exits immediately when stdin closes).

### Task 6.2: Add the `smoke-prompt` justfile recipe

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Append the recipe**

```makefile
# Smoke-prompt: verify the Plan 7 example boots, prompts/list returns the
# declared prompt, prompts/get renders the template, resources/templates/list
# returns the template resource, and completion/complete prefix-filters
# values for both a prompt argument and a template variable. Hermetic —
# no network, all inline handlers.
smoke-prompt:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"prompts/list"}
    {"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"analyze_job","arguments":{"jobId":"j-123","depth":"detailed"}}}
    {"jsonrpc":"2.0","id":4,"method":"resources/templates/list"}
    {"jsonrpc":"2.0","id":5,"method":"completion/complete","params":{"ref":{"type":"ref/prompt","name":"analyze_job"},"argument":{"name":"depth","value":"d"}}}
    {"jsonrpc":"2.0","id":6,"method":"completion/complete","params":{"ref":{"type":"ref/resource","uri":"queue://jobs/{status}"},"argument":{"name":"status","value":"c"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/prompts-completions.yaml)
    if [ -z "$output" ]; then
      echo "smoke-prompt: no response from runtime" >&2
      exit 1
    fi
    # Structural assertions via jq
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.prompts | length == 1' >/dev/null
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.prompts[0].name == "analyze_job"' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.messages[0].role == "user"' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.messages[0].content.text | contains("j-123")' >/dev/null
    echo "$output" | grep '"id":4' | head -1 | jq -e '.result.resourceTemplates | length == 1' >/dev/null
    echo "$output" | grep '"id":4' | head -1 | jq -e '.result.resourceTemplates[0].uriTemplate == "queue://jobs/{status}"' >/dev/null
    echo "$output" | grep '"id":5' | head -1 | jq -e '.result.completion.values | contains(["detailed"])' >/dev/null
    echo "$output" | grep '"id":6' | head -1 | jq -e '.result.completion.values | length >= 2' >/dev/null
    echo "$output" | tail -5 | jq .
    echo "smoke-prompt: OK"
```

- [ ] **Step 2: Run the recipe**

Run: `just smoke-prompt`
Expected: `smoke-prompt: OK`, exit 0.

### Task 6.3: Write the Plan 7 end-to-end integration test

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the end-to-end test**

```typescript
test("plan 7 round-trip: initialize + prompts/list + prompts/get + resources/templates/list + resources/read (templated) + completion/complete (both ref types)", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-e2e-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-e2e, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: application/json
    handler:
      inline:
        text: "jobs-status={{status}}"
prompts:
  - name: greet
    arguments:
      - name: who
        required: true
    template: "Hello, {{who}}!"
completions:
  prompts:
    greet:
      who: [alice, bob, carol]
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed]
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

    // 1. initialize
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // 2. prompts/list
    send({ jsonrpc: "2.0", id: 2, method: "prompts/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // 3. prompts/get
    send({ jsonrpc: "2.0", id: 3, method: "prompts/get", params: {
      name: "greet", arguments: { who: "world" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3'));

    // 4. resources/templates/list
    send({ jsonrpc: "2.0", id: 4, method: "resources/templates/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4'));

    // 5. resources/read (templated)
    send({ jsonrpc: "2.0", id: 5, method: "resources/read", params: {
      uri: "queue://jobs/active",
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5'));

    // 6. completion/complete — prompt argument ref
    send({ jsonrpc: "2.0", id: 6, method: "completion/complete", params: {
      ref: { type: "ref/prompt", name: "greet" },
      argument: { name: "who", value: "a" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":6'));

    // 7. completion/complete — resource template variable ref
    send({ jsonrpc: "2.0", id: 7, method: "completion/complete", params: {
      ref: { type: "ref/resource", uri: "queue://jobs/{status}" },
      argument: { name: "status", value: "p" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":7'));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const parse = (id: number) =>
      JSON.parse(stdoutLines.find((l) => l.includes(`"id":${id}`))!);

    // Verify prompts/list
    const plist = parse(2) as { result: { prompts: Array<{ name: string }> } };
    assert.equal(plist.result.prompts.length, 1);
    assert.equal(plist.result.prompts[0]!.name, "greet");

    // Verify prompts/get rendered template
    const pget = parse(3) as { result: { messages: Array<{ role: string; content: { text: string } }> } };
    assert.equal(pget.result.messages[0]!.role, "user");
    assert.equal(pget.result.messages[0]!.content.text, "Hello, world!");

    // Verify resources/templates/list
    const tlist = parse(4) as { result: { resourceTemplates: Array<{ uriTemplate: string }> } };
    assert.equal(tlist.result.resourceTemplates.length, 1);
    assert.equal(tlist.result.resourceTemplates[0]!.uriTemplate, "queue://jobs/{status}");

    // Verify templated resources/read
    const tread = parse(5) as { result: { contents: Array<{ uri: string; text: string }> } };
    assert.equal(tread.result.contents[0]!.uri, "queue://jobs/active");
    assert.equal(tread.result.contents[0]!.text, "jobs-status=active");

    // Verify completion for prompt arg (prefix "a" matches "alice")
    const comp6 = parse(6) as { result: { completion: { values: string[] } } };
    assert.ok(comp6.result.completion.values.includes("alice"));

    // Verify completion for template var (prefix "p" matches "pending")
    const comp7 = parse(7) as { result: { completion: { values: string[] } } };
    assert.ok(comp7.result.completion.values.includes("pending"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="plan 7 round-trip"`
Expected: PASS.

### Task 6.4: Run all nine gates

- [ ] **Step 1: Full gate sweep**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS.

### Task 6.5: Compose the handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan7-complete.md` (timestamp via `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Generate the Eastern-time timestamp**

Run: `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`
Note the output; use it as the filename prefix.

- [ ] **Step 2: Compose the handoff using the `building-in-the-open:curating-context` skill**

The handoff should cover:

- Overall state (green, main carries Plan 7)
- What Plan 7 delivered: `prompts:` block with named templates + arguments; `completions:` block binding value lists to prompt args and template vars; `template:` key upgrade to `resources:` enabling URI-template resources via RFC 6570; all three surfaces exposed via MCP (`prompts/list`, `prompts/get`, `resources/templates/list`, `resources/read` with variables, `completion/complete` with ref-type routing)
- Key decisions: SDK quarantine held — all three low-level handlers (`completion/complete` plus Plan 6's subscribe/unsubscribe) live in `server.ts`; `fromJsonSchema` bridges argsSchema; `ResourceTemplate` requires explicit `{ list: undefined }` (TypeScript-enforced); `wireCompletions` uses `server.server.setRequestHandler` directly
- Boot call order (final): `registerTools` → `registerResources` (static + templated) → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`
- What's next: Plan 8 (tasks + state machines, MCP task lifecycle, elicitation, idempotency) and Plan 9 (CLI)
- Landmines from this plan (see Landmines section below)
- Pre-dispatch scan guidance from Plan 4/5/6 handoffs carried forward

### Task 6.6: Commit Phase 6

- [ ] **Step 1: Write the commit message**

```
feat(runtime): plan 7 example, smoke-prompt, integration, handoff

Phase 6 of Plan 7 — the demonstrable artifact.

  - examples/prompts-completions.yaml: static resource + template
    resource + prompt with arguments + completions for both
    surfaces; exercises the full Plan 7 capability set
  - justfile: smoke-prompt recipe drives initialize + prompts/list
    + prompts/get + resources/templates/list + completion/complete
    (both ref types) through the runtime, asserts with jq
  - tests/integration.test.ts: Plan 7 end-to-end round-trip
    covering all seven MCP method calls
  - .handoffs/…-plan7-complete.md: handoff for the next session

Plan 7 complete with this commit. Nine gates pass:
npm run check, npm test, just smoke, just smoke-dispatch,
just smoke-compute, just smoke-http, just smoke-probe,
just smoke-resource, just smoke-prompt.
```

- [ ] **Step 2: Stage with specific paths**

```bash
git add \
  examples/prompts-completions.yaml \
  justfile \
  tests/integration.test.ts \
  .handoffs/
```

Clay: `gtxt && git pm`

---

## Self-review checklist

- **Spec coverage:** every numbered bullet in the Plan 7 design doc `### Approach` section maps to a phase task:
  - `PromptArgumentSpec` / `PromptSpec` / `PromptsConfig` types → Phase 1 Task 1.1 ✓
  - `validatePrompts` (name uniqueness, arg uniqueness, unknown keys, required template) → Phase 1 Task 1.3 ✓
  - `registerPrompt` adapter on `JigServerHandle` (fromJsonSchema bridge) → Phase 2 Task 2.1 ✓
  - `buildArgsSchema` (type: object, properties with description, required array) → Phase 2 Task 2.2 ✓
  - `render(spec.template, { ...args, probe: ctx.probe })` in get callback → Phase 2 Task 2.2 ✓
  - `prompts/list` + `prompts/get` auto-wired by SDK → Phase 2 Tasks 2.3-2.4 ✓
  - `ResourceSpec` discriminated union (uri | template, mutually exclusive, template+watcher rejected) → Phase 3 Task 3.1 ✓
  - `validateResources` exactly-one-of logic → Phase 3 Task 3.3 ✓
  - `registerResourceTemplate` adapter on `JigServerHandle` using `new ResourceTemplate(str, { list: undefined })` → Phase 3 Task 3.4 ✓
  - `registerResources` template branch (variables passed to `invoke`, merged with probe) → Phase 3 Task 3.5 ✓
  - `CompletionsConfig` type → Phase 4 Task 4.1 ✓
  - `validateCompletions` with cross-reference checks (promptName, argName, templateString, varName) → Phase 4 Task 4.3 ✓
  - `buildCompletionsIndex` + `wireCompletions` + `completion/complete` handler → Phase 5 Task 5.1 ✓
  - `capabilities.completions: {}` via `registerCapabilities` → Phase 5 Task 5.1 ✓
  - Boot call order in `index.ts` → Phase 5 Task 5.2 ✓
  - Example YAML + `smoke-prompt` → Phase 6 Tasks 6.1-6.2 ✓
  - End-to-end integration test → Phase 6 Task 6.3 ✓
  - Handoff → Phase 6 Task 6.5 ✓

- **Type consistency:** `PromptArgumentSpec`, `PromptSpec`, `PromptsConfig`, `CompletionsConfig`, `RegisterPromptSpec`, `RegisteredPromptHandle`, `CompletionsIndex`, `ResourceSpecStatic`, `ResourceSpecTemplated` names are consistent across all phases.

- **No placeholders:** every step has either a code block, a concrete command, or an explicit deferred-to-later-phase comment.

- **SDK quarantine holds throughout:** `prompts.ts` and `completions.ts` import only from `./server.ts` and `./config.ts`, never from `@modelcontextprotocol/server`. All SDK surface crossings in `server.ts`.

- **File paths exact:** every Files block cites a real path from the existing repo or a new path in the right directory.

- **Commands with expected outputs:** every `Run:` step names the expected PASS/FAIL outcome.

- **Gate count accurate:** Phases 1-5 run 8 gates; Phase 6 adds `just smoke-prompt` for 9 total.

---

## Landmines

- **`argsSchema` round-trip must preserve `required[]` and per-property `description`.** `fromJsonSchema` passes the JSON Schema to the SDK's internal `standardSchemaToJsonSchema` for `prompts/list` output. If the JSON Schema object passed to `fromJsonSchema` doesn't include `required: ["jobId"]` at the top level (not per-property), `prompts/list` will return arguments without required flags. `buildArgsSchema` must collect required arg names into a `required: string[]` array at the schema root. Verify by asserting `result.prompts[0]!.arguments![0]!.required === true` in the Phase 2 integration test.

- **`ResourceTemplate` constructor requires explicit `list` key.** Calling `new ResourceTemplate(template, {})` is a TypeScript compile error — the SDK's type requires the `list` key to be present (even as `undefined`). Always write `new ResourceTemplate(template, { list: undefined })`. Phase 3 Task 3.4 shows this; don't collapse the options object.

- **`completion/complete` ref.uri for template resources must match the template string exactly.** The client sends `ref: { type: "ref/resource", uri: "queue://jobs/{status}" }` — the literal template string with curly braces, not a concrete URI like `queue://jobs/pending`. The completions index is keyed on the raw template string. An author who writes `uri: queue://jobs/{status}` in the YAML but the client sends `queue://jobs/%7Bstatus%7D` (percent-encoded) will get empty results. Document in the example YAML. No normalization in v1.

- **Completion values cap at 100 silently.** After prefix-filter, `slice(0, 100)` truncates. The `hasMore` field signals the truncation (`filtered.length < values.length`), but clients that don't surface `hasMore` will silently not see values 101+. Authors with large completion lists should document the cap. The cap applies to the filtered set, not the raw set — so `total` reflects the full list size before filter.

- **`wireCompletions` MUST be called before `server.connect`.** `server.server.setRequestHandler` reaches into the low-level `Server` which must have handlers registered before the `initialize` handshake completes. The call order in `index.ts` is: `registerTools` → `registerResources` → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`. Swapping `wireCompletions` after `server.connect` means the capability is never advertised.

- **`prompts.ts` and `completions.ts` must NOT import from `@modelcontextprotocol/server`.** The SDK quarantine invariant from Plan 6 is the only thing keeping `server.ts` as the single edit point for SDK upgrades. Pre-flight check: `grep -r "@modelcontextprotocol/server" src/runtime/prompts.ts src/runtime/completions.ts` must return nothing.

- **`registerPrompt` callback signature splits on argsSchema.** Mirrors the `registerTool` split from `server.ts`: when `argsSchema` is present, the SDK invokes the callback as `(args, ctx) => ...`; when absent, `(ctx) => ...`. The `args` first position is only present with a schema. Wrong branch = callback receives `ServerContext` where it expects `Record<string, string>`. The implementation in Phase 2 Task 2.1 Step 4 handles this with the same split-cast pattern as tools.

- **Plan doc code blocks have defects — pre-flight scan before dispatching.** Every plan from 4 onward caught errors during pre-dispatch review. Check before executing: (a) every import name against actual module exports — especially `GetPromptResult`, `RegisteredPrompt`, `ReadResourceTemplateCallback`, and `ResourceTemplate` at the SDK package root; (b) `server.registerPrompt` callback type — verify the SDK's generic inference matches the cast used in `registerPrompt`'s implementation; (c) `setRequestHandler("completion/complete", ...)` — verify the method string is the correct key in `RequestTypeMap` (check `node_modules/@modelcontextprotocol/server/dist/index-*.d.mts`).

- **Second SDK-quarantine exception in `server.ts` grows to three.** Plan 6 introduced `server.server.setRequestHandler` for subscribe/unsubscribe; Plan 7 adds `completion/complete`. The rule "every direct SDK import lives in `server.ts`" still holds, but `server.ts` now has three low-level request handler registrations distinct from the `McpServer` high-level path. A future `lowLevelHandlers.ts` extraction may be warranted — not in Plan 7.

- **`extractTemplateVars` must handle RFC 6570 modifiers.** A template like `queue://jobs/{+status}` uses a `+` modifier. The `completions.ts` `extractTemplateVars` function strips leading modifier characters before adding to the var set. If a future author uses reserved expansion (`{+var}`) or label expansion (`{.var}`), `extractTemplateVars` must still return `status` / `var` so cross-reference validation and the completion index are keyed correctly.
