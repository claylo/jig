# jig Runtime — Plan 9 (elicitation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add `mcpStatus: input_required` states and `elicitation:` blocks to jig workflows, enabling YAML-authored state machines to pause for client input (form-based `elicitation/create` round-trip) and resume on the response. After this plan, a jig author writes a state machine that includes an `input_required` state with a schema for the client-rendered form, the interpreter calls `elicitInput` through the SDK, binds the response to `workflowCtx.elicitation`, and evaluates transitions against the enriched context.

**Architecture:** Six phases land in order. (0) This plan doc. (1) Acceptance YAML (`examples/tasks-elicitation.yaml`) + smoke recipe. (2) Parse-time: unlock `input_required` as valid mcpStatus, validate `elicitation:` blocks on states, add config types. (3) SDK adapter: thread an `elicit` callback from `server.ts` through the task handler to the interpreter. (4) Interpreter: handle `input_required` states — call elicit, bind response to `workflowCtx.elicitation`, evaluate transitions. (5) Smoke test + e2e integration tests + handoff.

**Tech Stack:** No new production dependencies. `elicitInput` is on the SDK's `ServerContext.mcpReq` — already imported via `@modelcontextprotocol/server@2.0.0-alpha.2`. JSONLogic engine (`json-logic-engine` v5) and Mustache `render` from `src/runtime/util/template.ts` are unchanged. TypeScript 6.0+, `node:test`, `yaml` all unchanged. 285 tests + 11 smoke gates pass at baseline.

---

## Scope Note

This is **plan 9 of ~10** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)).

**Planned sequence (updated):**

1. Plan 1 — smoke test (merged)
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. Plan 4 — connections + http + graphql (merged)
5. Plan 5 — probes (merged)
6. Plan 6 — resources + watchers (merged)
7. Plan 7 — prompts + completions + URI templates (merged)
8. Plan 8 — tasks + state machines (merged)
9. **Plan 9 — elicitation** (this plan)
10. Plan 10 — CLI (`jig new|dev|validate|build`) + build pipeline

**Out of scope for Plan 9 (carried to later plans or v2):**

- **URL-mode elicitation** — requires Streamable HTTP transport; not stdio-compatible
- **`cancelled` mcpStatus as author-declared terminal** — still client-initiated only
- **Structured content in terminal results** — still `result: { text }` only
- **Elicitation retries** — the author handles decline/cancel via transitions; no built-in retry loop
- **Elicitation timeout** — the SDK/client owns the timeout; jig awaits the promise

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **SDK quarantine holds.** `src/runtime/tasks.ts` imports zero symbols from `@modelcontextprotocol/server`. The `elicit` callback that reaches the interpreter is a jig-typed function (`ElicitParams => ElicitResponse`), not the SDK's `elicitInput`. The SDK crossing lives in `server.ts`.
- **`elicitation:` is only valid on `input_required` states.** A `working` state with `elicitation:` is a parse-time error.
- **`input_required` states have no `actions:` or `result:`.** Pre-elicitation work belongs in the prior state.
- **Twelve gates must all pass before the Phase 5 commit:** `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool && just smoke-task-elicitation`.
- **Commits via `commit.txt`.** Clay runs `gtxt` + `git pm`. Never `git commit` directly.
- **Specific-path `git add`** — never `-A`.
- **Feature branch per phase.** Branches: `chore/plan9-doc`, `chore/plan9-acceptance`, `feat/plan9-elicitation-schema`, `feat/plan9-elicit-adapter`, `feat/plan9-interpreter`, `feat/plan9-complete`.

---

## Phase 0 — Plan doc

**Branch:** `chore/plan9-doc`

- [ ] **Step 1:** Land the design doc and this plan doc.

```
record/designs/2026-04-16-plan9-elicitation.md   (already written)
record/plans/2026-04-16-jig-runtime-plan9.md     (this file)
```

- [ ] **Step 2:** Write `commit.txt`:

```
chore(runtime): plan 9 doc — elicitation design + implementation plan
```

---

## Phase 1 — Acceptance YAML + smoke recipe

**Branch:** `chore/plan9-acceptance`

**Files:**
- Create: `examples/tasks-elicitation.yaml`
- Modify: `justfile`

This phase lands the acceptance artifact. It will NOT boot until Phases 2-4 are complete (the validator currently rejects `input_required` and `elicitation:`). The smoke recipe will fail until then — that's the acceptance criterion.

- [ ] **Step 1:** Create `examples/tasks-elicitation.yaml`

```yaml
# A Plan 9 example exercising the elicitation surface.
# Demonstrates:
#   - mcpStatus: input_required with an elicitation: block
#   - Form-mode elicitation (message + schema)
#   - elicitation response binding in workflowCtx
#   - JSONLogic guards routing on elicitation.action and elicitation content
#   - Decline/cancel fallback via elicitation.action guard
#
# Run with `just smoke-task-elicitation`. Hermetic — no network, all inline
# handlers. The elicitation round-trip is simulated by the smoke helper
# sending an elicitation/create response with action: "accept".
#
# Workflow: validating → awaiting_approval (input_required) → approved/rejected.
# The approval state asks the client for a boolean "approved" field and an
# optional "reason" string. On accept+approved=true → completing. On
# accept+approved=false or decline → rejected. On cancel → failed.

server:
  name: jig-plan9-elicitation
  version: "1.0.0"
  description: |
    Plan 9 example: a deployment approval workflow with elicitation.

tasks:
  deploy_approval:
    initial: validating

    states:
      validating:
        mcpStatus: working
        statusMessage: "Validating deployment"
        actions:
          - inline:
              text: '{"valid": true, "target": "production"}'
        on:
          - when: { "==": [{ "var": "result.valid" }, false] }
            target: rejected
          - target: awaiting_approval

      awaiting_approval:
        mcpStatus: input_required
        statusMessage: "Waiting for deployment approval"
        elicitation:
          message: "Approve deployment to production?"
          required: [approved]
          schema:
            approved:
              type: boolean
              description: "Check to approve this deployment"
            reason:
              type: string
              description: "Optional reason for your decision"
        on:
          - when: { "and": [{ "==": [{ "var": "elicitation.action" }, "accept"] }, { "var": "elicitation.approved" }] }
            target: completing
          - when: { "==": [{ "var": "elicitation.action" }, "cancel"] }
            target: failed
          - target: rejected

      completing:
        mcpStatus: working
        statusMessage: "Finalizing deployment"
        actions:
          - inline:
              text: '{"deployed": true}'
        on:
          - target: completed

      completed:
        mcpStatus: completed
        result:
          text: "Deployment {{input.deployId}} approved and completed."

      rejected:
        mcpStatus: failed
        result:
          text: "Deployment {{input.deployId}} rejected."

      failed:
        mcpStatus: failed
        result:
          text: "Deployment {{input.deployId}} cancelled."

tools:
  - name: deploy
    description: "Run a deployment through the approval workflow."
    input:
      deployId:
        type: string
        required: true
    execution:
      taskSupport: required
    handler:
      workflow:
        ref: deploy_approval
        ttl_ms: 120000
```

- [ ] **Step 2:** Add `smoke-task-elicitation` recipe to `justfile`.

Append after the `smoke-task-one-tool` recipe:

```justfile
# Smoke-task-elicitation: verify the Plan 9 elicitation example boots, the
# workflow reaches input_required, the elicitation/create request arrives,
# a form response advances the workflow to completed, and tasks/result
# returns the rendered terminal text. Requires the client to respond to the
# elicitation/create server request — the inline node helper simulates this.
smoke-task-elicitation:
    #!/usr/bin/env bash
    set -euo pipefail
    node --experimental-transform-types -e '
      import { spawn } from "node:child_process";
      const child = spawn(process.execPath, [
        "--experimental-transform-types",
        "src/runtime/index.ts",
        "--config",
        "examples/tasks-elicitation.yaml",
      ], { stdio: ["pipe", "pipe", "pipe"] });
      child.stderr.on("data", () => {}); // drain stderr
      const lines = [];
      let buf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          if (line) lines.push(line);
          buf = buf.slice(i + 1);
        }
      });
      const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
      const wait = (pred, timeout = 10000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = setInterval(() => {
          const found = lines.find(pred);
          if (found) { clearInterval(tick); resolve(found); }
          else if (Date.now() - start > timeout) { clearInterval(tick); reject(new Error("timeout waiting for: " + pred)); }
        }, 25);
      });
      // 1. Initialize with elicitation capability
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion: "2025-11-25",
        capabilities: {
          tasks: { requests: { tools: { call: true } } },
          elicitation: { form: {} }
        },
        clientInfo: { name: "smoke-elicit", version: "0" }
      } });
      await wait((l) => l.includes("\"id\":1"));
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      await new Promise((r) => setTimeout(r, 50));
      // 2. tools/call → task created
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
        name: "deploy",
        arguments: { deployId: "d-99" },
        task: { ttl: 120000 }
      } });
      const callLine = await wait((l) => l.includes("\"id\":2") && l.includes("\"result\""));
      const callResp = JSON.parse(callLine);
      const taskId = callResp.result.task?.taskId;
      if (!taskId) { console.error("no taskId"); process.exit(1); }
      // 3. Wait for the elicitation/create request from the server
      const elicitLine = await wait((l) => l.includes("elicitation/create") && l.includes("requestedSchema"));
      const elicitReq = JSON.parse(elicitLine);
      const elicitId = elicitReq.id;
      if (!elicitId) { console.error("no elicitation request id"); process.exit(1); }
      // Verify the elicitation has our schema fields
      const schema = elicitReq.params?.requestedSchema;
      if (!schema?.properties?.approved) { console.error("missing approved field in schema"); process.exit(1); }
      // 4. Respond with accept + approved=true
      send({ jsonrpc: "2.0", id: elicitId, result: {
        action: "accept",
        content: { approved: true, reason: "LGTM" }
      } });
      // 5. Poll tasks/get until completed
      let status = "working";
      let pollId = 3;
      const startPoll = Date.now();
      while ((status === "working" || status === "input_required") && Date.now() - startPoll < 10000) {
        send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
        const idM = "\"id\":" + pollId;
        const getLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
        status = JSON.parse(getLine).result.status;
        pollId++;
        if (status === "working" || status === "input_required") await new Promise((r) => setTimeout(r, 50));
      }
      if (status !== "completed") { console.error("task did not complete: " + status); process.exit(1); }
      // 6. tasks/result
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
      const idM = "\"id\":" + pollId;
      const resLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
      const finalText = JSON.parse(resLine).result.content[0].text;
      if (!finalText.includes("d-99")) { console.error("result missing deployId: " + finalText); process.exit(1); }
      if (!finalText.includes("approved")) { console.error("result missing approved: " + finalText); process.exit(1); }
      console.log(JSON.stringify({ taskId, status, finalText }, null, 2));
      child.kill();
    '
    echo "smoke-task-elicitation: OK"
```

- [ ] **Step 3:** Verify the smoke recipe fails (expected — `input_required` is still rejected at parse time).

Run: `just smoke-task-elicitation 2>&1 || echo "Expected failure: input_required rejected"`

Expected: non-zero exit, error message containing "input_required" or "Plan 9".

- [ ] **Step 4:** Write `commit.txt`:

```
chore(runtime): plan 9 acceptance — elicitation example YAML + smoke recipe

Lands examples/tasks-elicitation.yaml and the smoke-task-elicitation
justfile recipe. Both will fail until Phases 2-4 unlock input_required
states and wire the elicitation round-trip.
```

---

## Phase 2 — Parse-time: unlock `input_required` + validate `elicitation:`

**Branch:** `feat/plan9-elicitation-schema`

**Files:**
- Modify: `src/runtime/config.ts` (add types)
- Modify: `src/runtime/tasks.ts` (unlock `input_required`, validate `elicitation:`)
- Modify: `tests/tasks.test.ts` (flip rejection tests, add acceptance + validation tests)

### Step 1: Config types

- [ ] **Step 1a:** Add `ElicitationFieldSpec` and `ElicitationSpec` to `src/runtime/config.ts`.

After the `WorkflowSpec` interface (around line 225), add:

```typescript
/**
 * One field in an elicitation form schema. Subset of the MCP SDK's
 * requestedSchema property types. The interpreter translates these
 * to the SDK's form-mode elicitation shape at runtime.
 */
export interface ElicitationFieldSpec {
  type: "string" | "boolean" | "number" | "integer" | "array";
  description?: string;
  title?: string;
  // string-specific
  enum?: string[];
  enumNames?: string[];
  oneOf?: Array<{ const: string; title: string }>;
  format?: "email" | "date" | "uri" | "date-time";
  minLength?: number;
  maxLength?: number;
  default?: unknown;
  // number/integer-specific
  minimum?: number;
  maximum?: number;
  // array-specific
  items?: { type: "string"; enum: string[] };
  minItems?: number;
  maxItems?: number;
}

/**
 * Elicitation block on an input_required state. Drives a form-mode
 * elicitation/create request to the client.
 */
export interface ElicitationSpec {
  message: string;
  required?: string[];
  schema: Record<string, ElicitationFieldSpec>;
}
```

- [ ] **Step 1b:** Widen `StateSpec.mcpStatus` to include `"input_required"` and add the `elicitation` field.

In `src/runtime/config.ts`, change `StateSpec` (around line 214):

```typescript
export interface StateSpec {
  mcpStatus: "working" | "input_required" | "completed" | "failed";
  statusMessage?: string;
  elicitation?: ElicitationSpec;
  actions?: Handler[];
  on?: TransitionSpec[];
  result?: { text: string };
}
```

### Step 2: Flip the rejection tests

- [ ] **Step 2a:** In `tests/tasks.test.ts`, replace the test at line 101 ("config rejects a state with mcpStatus: input_required") with an acceptance test:

```typescript
test("config accepts a state with mcpStatus: input_required and elicitation:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        statusMessage: "Waiting for input"
        elicitation:
          message: "Approve?"
          schema:
            approved: { type: boolean }
        on:
          - target: done
      done: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  const cfg = parseConfig(yamlText);
  const state = cfg.tasks!["w"]!.states["ask"]!;
  assert.equal(state.mcpStatus, "input_required");
  assert.equal(state.elicitation!.message, "Approve?");
  assert.deepEqual(Object.keys(state.elicitation!.schema), ["approved"]);
  assert.equal(state.elicitation!.schema["approved"]!.type, "boolean");
});
```

- [ ] **Step 2b:** Replace the test at line 275 ("config rejects a state with elicitation: (Plan 9)") with a test that rejects `elicitation:` on a non-`input_required` state:

```typescript
test("config rejects elicitation: on a working state (only valid on input_required)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        elicitation:
          message: "nope"
          schema:
            x: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation.*only valid.*input_required/i,
  );
});
```

- [ ] **Step 2c:** Run tests to verify the new tests FAIL (the validator still rejects `input_required`):

Run: `npm test -- --test-name-pattern "config accepts a state with mcpStatus: input_required" 2>&1`

Expected: FAIL — the validator throws "Plan 9".

### Step 3: Update the validator in `tasks.ts`

- [ ] **Step 3a:** In `src/runtime/tasks.ts`, add `"elicitation"` to `STATE_KNOWN` (line 14):

```typescript
const STATE_KNOWN = new Set([
  "mcpStatus",
  "statusMessage",
  "elicitation",
  "actions",
  "on",
  "result",
]);
```

- [ ] **Step 3b:** Remove the `input_required` rejection block (lines 147-151). Replace with nothing — `input_required` becomes a valid value handled below.

Remove:

```typescript
  if (mcpStatusRaw === "input_required") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "input_required" lands in Plan 9 (elicitation). Use working/completed/failed in Plan 8.`,
    );
  }
```

- [ ] **Step 3c:** Remove the `elicitation` rejection block (lines 131-136). Replace with nothing — `elicitation` is now a known key validated below.

Remove:

```typescript
  // Reject the Plan-9 elicitation: key explicitly so the error names the plan.
  if ("elicitation" in s) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: blocks land in Plan 9 (input_required + elicitation/create round-trip). Remove the elicitation: key.`,
    );
  }
```

- [ ] **Step 3d:** Widen the mcpStatus validation to accept `"input_required"` (around line 157 after the removals):

Change:

```typescript
  if (
    mcpStatusRaw !== "working" &&
    mcpStatusRaw !== "completed" &&
    mcpStatusRaw !== "failed"
  ) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.mcpStatus must be one of "working", "completed", "failed" (got ${JSON.stringify(mcpStatusRaw)})`,
    );
  }
  const mcpStatus = mcpStatusRaw as "working" | "completed" | "failed";
```

To:

```typescript
  if (
    mcpStatusRaw !== "working" &&
    mcpStatusRaw !== "input_required" &&
    mcpStatusRaw !== "completed" &&
    mcpStatusRaw !== "failed"
  ) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.mcpStatus must be one of "working", "input_required", "completed", "failed" (got ${JSON.stringify(mcpStatusRaw)})`,
    );
  }
  const mcpStatus = mcpStatusRaw as "working" | "input_required" | "completed" | "failed";
```

- [ ] **Step 3e:** Restructure the shape-constraint block to handle three categories: terminal, input_required, and working. The existing code has two branches (`isTerminal` / `else`). With `input_required` as a third non-terminal shape, the `else` branch would produce confusing "non-terminal (mcpStatus: working)" errors for `input_required` states. Replace the entire shape-constraint section with a three-way branch:

```typescript
  const isTerminal = mcpStatus === "completed" || mcpStatus === "failed";
  const isInputRequired = mcpStatus === "input_required";

  // elicitation: is only valid on input_required states.
  if (!isInputRequired && s["elicitation"] !== undefined) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: is only valid on input_required states (this state has mcpStatus: ${mcpStatus})`,
    );
  }

  // Shape constraints.
  if (isTerminal) {
    if (!s["result"] || typeof s["result"] !== "object") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state (mcpStatus: ${mcpStatus}) requires a result: { text } block`,
      );
    }
    if (s["actions"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare actions:`,
      );
    }
    if (s["on"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare on:`,
      );
    }
  } else if (isInputRequired) {
    if (s["elicitation"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an elicitation: block`,
      );
    }
    if (s["actions"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare actions: (pre-elicitation work belongs in the prior state)`,
      );
    }
    if (s["result"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare result: (it is not terminal)`,
      );
    }
    if (s["on"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an on: array (transitions after elicitation response)`,
      );
    }
  } else {
    // mcpStatus: working
    if (s["result"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state (mcpStatus: working) MUST NOT declare result:`,
      );
    }
    if (s["on"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state requires an on: array (otherwise the workflow never advances)`,
      );
    }
  }
```

This replaces the existing `if (isTerminal) { ... } else { ... }` block entirely.

- [ ] **Step 3f:** Add `validateElicitation` function in `tasks.ts` and call it from `validateState`.

```typescript
function validateElicitation(
  entry: unknown,
  workflowName: string,
  stateName: string,
): ElicitationSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation must be a mapping`,
    );
  }
  const e = entry as Record<string, unknown>;

  // Known keys
  const known = new Set(["message", "schema", "required"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation: unknown key "${key}"`,
      );
    }
  }

  if (typeof e["message"] !== "string" || e["message"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.message is required and must be a non-empty string`,
    );
  }

  if (!e["schema"] || typeof e["schema"] !== "object" || Array.isArray(e["schema"])) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema is required and must be a mapping`,
    );
  }
  const rawSchema = e["schema"] as Record<string, unknown>;
  if (Object.keys(rawSchema).length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema must declare at least one field`,
    );
  }

  const schema: Record<string, ElicitationFieldSpec> = {};
  for (const [fieldName, fieldEntry] of Object.entries(rawSchema)) {
    schema[fieldName] = validateElicitationField(
      fieldEntry, workflowName, stateName, fieldName,
    );
  }

  const out: ElicitationSpec = { message: e["message"], schema };

  if (e["required"] !== undefined) {
    if (!Array.isArray(e["required"]) || !e["required"].every((r: unknown) => typeof r === "string")) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation.required must be an array of strings`,
      );
    }
    // Every required field must be declared in schema.
    for (const req of e["required"] as string[]) {
      if (!(req in schema)) {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.elicitation.required lists "${req}" but it is not in schema`,
        );
      }
    }
    out.required = e["required"] as string[];
  }

  return out;
}

const ELICITATION_FIELD_TYPES = new Set(["string", "boolean", "number", "integer", "array"]);

function validateElicitationField(
  entry: unknown,
  workflowName: string,
  stateName: string,
  fieldName: string,
): ElicitationFieldSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName} must be a mapping`,
    );
  }
  const f = entry as Record<string, unknown>;

  if (!ELICITATION_FIELD_TYPES.has(f["type"] as string)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName}.type must be one of "string", "boolean", "number", "integer", "array" (got ${JSON.stringify(f["type"])})`,
    );
  }

  const out: ElicitationFieldSpec = { type: f["type"] as ElicitationFieldSpec["type"] };
  if (typeof f["description"] === "string") out.description = f["description"];
  if (typeof f["title"] === "string") out.title = f["title"];
  if (f["default"] !== undefined) out.default = f["default"];

  // Type-specific optional fields (loose validation — the SDK validates strictly)
  if (Array.isArray(f["enum"])) out.enum = f["enum"] as string[];
  if (Array.isArray(f["enumNames"])) out.enumNames = f["enumNames"] as string[];
  if (Array.isArray(f["oneOf"])) out.oneOf = f["oneOf"] as Array<{ const: string; title: string }>;
  if (typeof f["format"] === "string") out.format = f["format"] as ElicitationFieldSpec["format"];
  if (typeof f["minLength"] === "number") out.minLength = f["minLength"];
  if (typeof f["maxLength"] === "number") out.maxLength = f["maxLength"];
  if (typeof f["minimum"] === "number") out.minimum = f["minimum"];
  if (typeof f["maximum"] === "number") out.maximum = f["maximum"];
  if (f["items"] !== undefined && typeof f["items"] === "object") out.items = f["items"] as { type: "string"; enum: string[] };
  if (typeof f["minItems"] === "number") out.minItems = f["minItems"];
  if (typeof f["maxItems"] === "number") out.maxItems = f["maxItems"];

  return out;
}
```

Add the import for `ElicitationFieldSpec` and `ElicitationSpec` at the top of `tasks.ts`:

```typescript
import type {
  Handler,
  ElicitationFieldSpec,
  ElicitationSpec,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
```

Wire `validateElicitation` into `validateState`: when `isInputRequired` and `s["elicitation"]` is defined (already checked by the shape constraint above), parse it:

```typescript
  if (s["elicitation"] !== undefined) {
    out.elicitation = validateElicitation(s["elicitation"], workflowName, stateName);
  }
```

### Step 4: More validation tests

- [ ] **Step 4a:** Add tests to `tests/tasks.test.ts` for the new validation rules:

```typescript
test("config rejects input_required without elicitation:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*requires.*elicitation/i,
  );
});

test("config rejects input_required with actions:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
        actions:
          - inline: { text: nope }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*MUST NOT.*actions/i,
  );
});

test("config rejects input_required without on:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*requires.*on/i,
  );
});

test("config rejects input_required with result:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
        on:
          - target: b
        result: { text: nope }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*MUST NOT.*result/i,
  );
});

test("config rejects elicitation: with missing message", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          schema:
            ok: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.message.*required/i,
  );
});

test("config rejects elicitation: with missing schema", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema.*required/i,
  );
});

test("config rejects elicitation: with empty schema", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema: {}
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema.*at least one field/i,
  );
});

test("config rejects elicitation field with invalid type", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            name: { type: object }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema\.name\.type must be one of/i,
  );
});

test("config rejects elicitation.required listing an undeclared field", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          required: [ghost]
          schema:
            ok: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /required.*"ghost".*not in schema/i,
  );
});

test("config accepts elicitation with required + multiple field types", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        elicitation:
          message: "Configure"
          required: [env]
          schema:
            env:
              type: string
              enum: [staging, production]
            count:
              type: integer
              minimum: 1
              maximum: 10
            notify:
              type: boolean
              default: true
        on:
          - target: done
      done: { mcpStatus: completed, result: { text: ok } }
tools: []
`;
  const cfg = parseConfig(yamlText);
  const el = cfg.tasks!["w"]!.states["ask"]!.elicitation!;
  assert.deepEqual(el.required, ["env"]);
  assert.equal(el.schema["env"]!.type, "string");
  assert.deepEqual(el.schema["env"]!.enum, ["staging", "production"]);
  assert.equal(el.schema["count"]!.type, "integer");
  assert.equal(el.schema["count"]!.minimum, 1);
  assert.equal(el.schema["notify"]!.type, "boolean");
  assert.equal(el.schema["notify"]!.default, true);
});
```

- [ ] **Step 4b:** Update the "config rejects a state with bogus mcpStatus" test to include `input_required` in the expected error message (line 153):

Change the regex from:
```
/mcpStatus must be one of "working", "completed", "failed"/
```
To:
```
/mcpStatus must be one of "working", "input_required", "completed", "failed"/
```

- [ ] **Step 5:** Run all tests:

Run: `npm test`

Expected: All pass (including the flipped tests and new validation tests).

- [ ] **Step 6:** Run type-check:

Run: `npm run check`

Expected: 0 errors.

- [ ] **Step 7:** Run all existing smoke gates to verify no regressions:

Run: `just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool`

Expected: All pass.

- [ ] **Step 8:** Write `commit.txt`:

```
feat(runtime): elicitation schema — unlock input_required + validate elicitation blocks

Removes the Plan-8 parse-time rejections for mcpStatus: input_required
and elicitation: keys. Adds ElicitationSpec / ElicitationFieldSpec config
types, validateElicitation with field-type checking and required-field
cross-ref, and shape constraints for input_required states (must have
elicitation + on, must not have actions or result).
```

---

## Phase 3 — SDK adapter: thread `elicit` through server.ts

**Branch:** `feat/plan9-elicit-adapter`

**Files:**
- Modify: `src/runtime/tasks.ts` (add `ElicitParams`, `ElicitResponse` types; add `elicit` to `InterpretWorkflowOptions`; widen `updateTaskStatus` union)
- Modify: `src/runtime/server.ts` (widen `InterpreterTaskStore.updateTaskStatus`; thread `elicitInput` through `JigTaskHandler`)
- Modify: `src/runtime/index.ts` (pass `elicit` through `startWorkflowTask`)
- Modify: `tests/tasks.test.ts` (update `makeTrackingStore` and interpreter call sites)

### Step 1: Add jig-owned elicitation types to `tasks.ts`

- [ ] **Step 1a:** Add `ElicitParams` and `ElicitResponse` types below the `InterpreterTaskStore` interface (around line 340 in the original, adjusted after Phase 2 edits):

```typescript
/**
 * Jig-owned elicitation request shape. The interpreter builds this from
 * the state's ElicitationSpec; the adapter in server.ts translates it
 * to the SDK's ElicitRequestFormParams. Keeps tasks.ts SDK-free.
 */
export interface ElicitParams {
  message: string;
  requestedSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Jig-owned elicitation response shape. Mirrors the SDK's ElicitResult
 * but with a narrower content type.
 */
export interface ElicitResponse {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}
```

- [ ] **Step 1b:** Add `elicit` to `InterpretWorkflowOptions`:

```typescript
export interface InterpretWorkflowOptions {
  workflow: WorkflowSpec;
  args: Record<string, unknown>;
  ctx: InvokeContext;
  store: InterpreterTaskStore;
  taskId: string;
  invoke: (
    handler: Handler,
    args: Record<string, unknown>,
    ctx: InvokeContext,
  ) => Promise<ToolCallResult>;
  elicit: (params: ElicitParams) => Promise<ElicitResponse>;
}
```

- [ ] **Step 1c:** Widen `InterpreterTaskStore.updateTaskStatus` to accept `"input_required"`:

```typescript
export interface InterpreterTaskStore {
  storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: CallToolResult,
  ): Promise<void>;
  updateTaskStatus(
    taskId: string,
    status: "working" | "input_required" | "completed" | "failed",
    statusMessage?: string,
  ): Promise<void>;
}
```

### Step 2: Update `server.ts`

- [ ] **Step 2a:** Add `elicit` to `JigTaskHandler.createTask` signature:

Change:

```typescript
  createTask(
    args: Record<string, unknown>,
    store: RequestTaskStore,
  ): Promise<CreateTaskResult>;
```

To:

```typescript
  createTask(
    args: Record<string, unknown>,
    store: RequestTaskStore,
    elicit: (params: unknown) => Promise<unknown>,
  ): Promise<CreateTaskResult>;
```

The `unknown` types here are the SDK quarantine boundary — `server.ts` wraps `ctx.mcpReq.elicitInput` and `index.ts` provides the jig-typed `ElicitParams`/`ElicitResponse` adapter.

- [ ] **Step 2b:** In the `registerToolTask` method of `createServer`, thread `ctx.mcpReq.elicitInput` to the handler:

In the `taskHandler.createTask` callback (around line 521-523), change:

```typescript
        createTask: async (
          args: Record<string, unknown>,
          ctx: CreateTaskServerContext,
        ) => handler.createTask(args, ctx.task.store),
```

To:

```typescript
        createTask: async (
          args: Record<string, unknown>,
          ctx: CreateTaskServerContext,
        ) => handler.createTask(args, ctx.task.store, ctx.mcpReq.elicitInput as (params: unknown) => Promise<unknown>),
```

And in the no-schema branch (around line 569-571), change similarly:

```typescript
          createTask: async (
            _args: undefined,
            ctx: CreateTaskServerContext,
          ) => handler.createTask({}, ctx.task.store, ctx.mcpReq.elicitInput as (params: unknown) => Promise<unknown>),
```

### Step 3: Update `index.ts`

- [ ] **Step 3a:** Import `ElicitParams` and `ElicitResponse` from `tasks.ts`:

```typescript
import { interpretWorkflow, type ElicitParams, type ElicitResponse } from "./tasks.ts";
```

- [ ] **Step 3b:** Update `startWorkflowTask` to accept and pass `elicit`:

Change the signature:

```typescript
    async function startWorkflowTask(
      workflowRef: string,
      ttl_ms: number,
      args: Record<string, unknown>,
      store: Parameters<JigTaskHandler["createTask"]>[1],
      elicit: (params: unknown) => Promise<unknown>,
    ) {
```

And pass it to `interpretWorkflow`:

```typescript
      void interpretWorkflow({
        workflow,
        args,
        ctx,
        store,
        taskId: task.taskId,
        invoke,
        elicit: async (params: ElicitParams): Promise<ElicitResponse> => {
          const result = await elicit(params) as { action: string; content?: Record<string, unknown> };
          return {
            action: result.action as ElicitResponse["action"],
            content: result.content,
          };
        },
      });
```

- [ ] **Step 3c:** Update all call sites of `startWorkflowTask` to pass `elicit`:

In the `createTask` callback (two places — outer workflow and dispatch-routes-to-workflow):

```typescript
        async createTask(args, store, elicit) {
          if (isOuterWorkflow) {
            return startWorkflowTask(
              outerHandler.workflow.ref,
              outerHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
              elicit,
            );
          }
          // ... dispatch resolution ...
          if ("workflow" in caseHandler) {
            return startWorkflowTask(
              caseHandler.workflow.ref,
              caseHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
              elicit,
            );
          }
          // ... sync case (no elicit needed) ...
```

### Step 4: Update tests

- [ ] **Step 4a:** Add a no-op `elicit` stub to `makeTrackingStore` or alongside it in `tests/tasks.test.ts`:

```typescript
/** No-op elicit stub — phases before Phase 4 never hit input_required states. */
const noopElicit = async (): Promise<{ action: "cancel" as const }> => ({ action: "cancel" });
```

- [ ] **Step 4b:** Add `elicit: noopElicit` to every existing `interpretWorkflow` call in tests. There are 6 existing interpreter tests — each needs the new field:

```typescript
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
```

- [ ] **Step 5:** Run all tests + type-check:

Run: `npm run check && npm test`

Expected: All pass.

- [ ] **Step 6:** Run all smoke gates:

Run: `just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool`

Expected: All pass.

- [ ] **Step 7:** Write `commit.txt`:

```
feat(runtime): elicit adapter — thread elicitInput through SDK quarantine

Adds ElicitParams/ElicitResponse jig-owned types to tasks.ts. Threads
ctx.mcpReq.elicitInput from the SDK's CreateTaskServerContext through
server.ts → JigTaskHandler.createTask → startWorkflowTask →
interpretWorkflow. The interpreter receives a jig-typed elicit callback;
tasks.ts remains SDK-free. Widens InterpreterTaskStore.updateTaskStatus
to accept "input_required".
```

---

## Phase 4 — Interpreter: handle `input_required` states

**Branch:** `feat/plan9-interpreter`

**Files:**
- Modify: `src/runtime/tasks.ts` (interpreter `input_required` handling + `buildRequestedSchema` helper)
- Modify: `tests/tasks.test.ts` (interpreter elicitation round-trip tests)

### Step 1: Interpreter tests (RED)

- [ ] **Step 1a:** Add interpreter test for `input_required` state with accept response:

```typescript
test("interpreter handles input_required: elicit → accept → transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            statusMessage: "Need approval",
            elicitation: {
              message: "Approve?",
              schema: {
                approved: { type: "boolean" },
              },
            },
            on: [
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "accept" as const,
    content: { approved: true },
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.ok(
    tracker.statusUpdates.some((u) => u.status === "input_required"),
    "input_required status pushed",
  );
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "approved");
});
```

- [ ] **Step 1b:** Add test for decline response routing to fallback transition:

```typescript
test("interpreter handles input_required: elicit → decline → fallback transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "declined" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "decline" as const,
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "declined");
});
```

- [ ] **Step 1c:** Add test for elicit throwing (client lacks capability):

```typescript
test("interpreter safeFails when elicit throws", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "ok" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => {
    throw new Error("Client does not support elicitation");
  };
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }>; isError?: boolean };
  assert.ok(r.isError);
  assert.match(r.content[0]!.text, /elicit.*failed|Client does not support/i);
});
```

- [ ] **Step 1d:** Add test for elicitation.action routing:

```typescript
test("interpreter exposes elicitation.action for explicit cancel routing", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [
              { when: { "==": [{ "var": "elicitation.action" }, "cancel"] }, target: "cancelled" },
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
          cancelled: { mcpStatus: "failed", result: { text: "user cancelled" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "cancel" as const,
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "user cancelled");
});
```

- [ ] **Step 1e:** Add test that `workflowCtx.elicitation` is available in terminal Mustache render:

```typescript
test("interpreter renders elicitation fields in terminal result text", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Name?",
              schema: { name: { type: "string" } },
            },
            on: [{ target: "done" }],
          },
          done: {
            mcpStatus: "completed",
            result: { text: "Hello {{elicitation.name}}!" },
          },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "accept" as const,
    content: { name: "Clay" },
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "Hello Clay!");
});
```

- [ ] **Step 1f:** Run tests to verify these 5 new tests FAIL:

Run: `npm test -- --test-name-pattern "interpreter handles input_required|interpreter safeFails when elicit|interpreter exposes elicitation|interpreter renders elicitation" 2>&1`

Expected: All 5 FAIL — the interpreter doesn't handle `input_required` yet.

### Step 2: Implement `input_required` handling in interpreter

- [ ] **Step 2a:** Add a `buildRequestedSchema` helper in `tasks.ts` that converts `ElicitationSpec` to `ElicitParams`:

```typescript
/**
 * Build the SDK-shaped requestedSchema from a validated ElicitationSpec.
 * Each field gets a `title` defaulting to the capitalized field name.
 */
function buildRequestedSchema(
  spec: ElicitationSpec,
): ElicitParams["requestedSchema"] {
  const properties: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec.schema)) {
    const prop: Record<string, unknown> = { type: field.type };
    prop.title = field.title ?? name.charAt(0).toUpperCase() + name.slice(1);
    if (field.description !== undefined) prop.description = field.description;
    if (field.default !== undefined) prop.default = field.default;
    // string-specific
    if (field.enum !== undefined) prop.enum = field.enum;
    if (field.enumNames !== undefined) prop.enumNames = field.enumNames;
    if (field.oneOf !== undefined) prop.oneOf = field.oneOf;
    if (field.format !== undefined) prop.format = field.format;
    if (field.minLength !== undefined) prop.minLength = field.minLength;
    if (field.maxLength !== undefined) prop.maxLength = field.maxLength;
    // number/integer-specific
    if (field.minimum !== undefined) prop.minimum = field.minimum;
    if (field.maximum !== undefined) prop.maximum = field.maximum;
    // array-specific
    if (field.items !== undefined) prop.items = field.items;
    if (field.minItems !== undefined) prop.minItems = field.minItems;
    if (field.maxItems !== undefined) prop.maxItems = field.maxItems;
    properties[name] = prop;
  }
  const schema: ElicitParams["requestedSchema"] = {
    type: "object",
    properties,
  };
  if (spec.required !== undefined) schema.required = spec.required;
  return schema;
}
```

- [ ] **Step 2b:** Update `workflowCtx` type to include `elicitation`:

In `interpretWorkflow`, change the `workflowCtx` declaration:

```typescript
  const workflowCtx: {
    input: Record<string, unknown>;
    result: unknown;
    probe: Record<string, unknown>;
    elicitation: Record<string, unknown>;
  } = {
    input: args,
    result: undefined,
    probe: ctx.probe,
    elicitation: {},
  };
```

- [ ] **Step 2c:** In the interpreter's `while` loop, after the `updateTaskStatus` call and before the actions block, add `input_required` handling:

```typescript
    // ── input_required: elicit and bind ──
    if (state.mcpStatus === "input_required" && state.elicitation !== undefined) {
      let elicitResult: ElicitResponse;
      try {
        elicitResult = await elicit(
          buildRequestedSchema(state.elicitation),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await safeFail(
          store,
          taskId,
          `elicitation failed in state "${current}": ${message}`,
        );
        return;
      }
      // Bind response: action is always present; content fields spread in.
      workflowCtx.elicitation = {
        action: elicitResult.action,
        ...(elicitResult.content ?? {}),
      };
      // Skip the actions block — input_required states have no actions.
      // Fall through to transition evaluation below.
    }
```

Wait — the `elicit` call needs the full `ElicitParams`, not just the `requestedSchema`. Fix:

```typescript
        elicitResult = await elicit({
          message: state.elicitation.message,
          requestedSchema: buildRequestedSchema(state.elicitation),
        });
```

Hmm, but `buildRequestedSchema` already returns the `requestedSchema` part. Let me restructure: make `buildRequestedSchema` return only the `requestedSchema` field, and build the full `ElicitParams` at the call site:

```typescript
        elicitResult = await elicit({
          message: state.elicitation.message,
          requestedSchema: buildRequestedSchema(state.elicitation),
        });
```

This is correct — `buildRequestedSchema` builds the schema portion, the call site adds `message`.

- [ ] **Step 2d:** Ensure the `input_required` block is placed BEFORE the actions block in the interpreter loop, and includes a `continue`-to-transitions guard. Actually, the control flow is cleaner if the `input_required` handler replaces the actions block for that state. Since `input_required` states MUST NOT have actions (parse-time constraint), the actions block naturally skips. The only thing we need is to ensure `workflowCtx.elicitation` is bound before transition evaluation.

Place the `input_required` block after the status update and before the actions block:

```typescript
    // Push status update; do not await failure-blocking.
    void store
      .updateTaskStatus(taskId, state.mcpStatus, state.statusMessage)
      .catch(() => { /* Swallow — status push is best-effort. */ });

    // ── input_required: elicit and bind ──
    if (state.mcpStatus === "input_required" && state.elicitation !== undefined) {
      let elicitResult: ElicitResponse;
      try {
        elicitResult = await elicit({
          message: state.elicitation.message,
          requestedSchema: buildRequestedSchema(state.elicitation),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await safeFail(
          store,
          taskId,
          `elicitation failed in state "${current}": ${message}`,
        );
        return;
      }
      workflowCtx.elicitation = {
        action: elicitResult.action,
        ...(elicitResult.content ?? {}),
      };
      // Fall through to transition evaluation (no actions on input_required states).
    }

    // Run actions in sequence (skipped for input_required — no actions).
    if (state.actions !== undefined) {
      // ... existing actions code ...
    }
```

### Step 3: Run tests

- [ ] **Step 3a:** Run the interpreter tests:

Run: `npm test -- --test-name-pattern "interpreter" 2>&1`

Expected: All 11 interpreter tests pass (6 existing + 5 new).

- [ ] **Step 3b:** Run full test suite + type-check:

Run: `npm run check && npm test`

Expected: All pass.

- [ ] **Step 3c:** Run all smoke gates (elicitation smoke will still fail — boot works now but the smoke helper needs a real client-side elicitation response):

Run: `just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool`

Expected: All 9 existing gates pass.

- [ ] **Step 4:** Write `commit.txt`:

```
feat(runtime): interpreter elicitation — input_required states call elicit and bind response

The interpreter now handles mcpStatus: input_required states by calling
the elicit callback with the state's elicitation spec, binding the
response to workflowCtx.elicitation ({ action, ...content }), and
evaluating transitions against the enriched context. Elicit failures
safeFail the task. Decline/cancel are data — no special-casing, just
JSONLogic guards on elicitation.action.
```

---

## Phase 5 — Smoke + e2e + handoff

**Branch:** `feat/plan9-complete`

**Files:**
- Modify: `tests/integration.test.ts` (add elicitation e2e test)
- Create: `.handoffs/2026-04-16-HHMM-jig-runtime-plan9-complete.md`

### Step 1: Integration test

- [ ] **Step 1a:** Add an e2e integration test to `tests/integration.test.ts`. This test:
  - Boots a config with an `input_required` state
  - Sends `tools/call` to create a task
  - Waits for the `elicitation/create` server request on stdout
  - Responds with `action: "accept"` + content
  - Polls `tasks/get` until completed
  - Verifies `tasks/result` has the expected rendered text

```typescript
test("plan 9 elicitation lifecycle: tools/call -> elicitation/create -> accept -> tasks/result", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan9-elicit-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan9-elicit, version: "0.0.1" }
tasks:
  confirm_workflow:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        statusMessage: "Awaiting confirmation"
        elicitation:
          message: "Proceed?"
          required: [ok]
          schema:
            ok:
              type: boolean
              description: "Confirm"
        on:
          - when: { "var": "elicitation.ok" }
            target: done
          - target: rejected
      done:
        mcpStatus: completed
        result:
          text: "Confirmed for {{input.item}}"
      rejected:
        mcpStatus: failed
        result:
          text: "Rejected for {{input.item}}"
tools:
  - name: confirm
    description: "Confirm an item"
    input:
      item: { type: string, required: true }
    execution:
      taskSupport: required
    handler:
      workflow: { ref: confirm_workflow }
`);
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
  child.stderr.on("data", () => {}); // drain stderr

  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    // 1. Initialize with elicitation capability
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: {
        tasks: { requests: { tools: { call: true } } },
        elicitation: { form: {} },
      },
      clientInfo: { name: "test-elicit", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    // 2. tools/call -> CreateTaskResult
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "confirm",
      arguments: { item: "deploy-v3" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const callResp = JSON.parse(callLine);
    const taskId = callResp.result.task?.taskId;
    assert.ok(taskId, "tools/call returned a taskId");

    // 3. Wait for elicitation/create request from server
    await waitForLine(stdoutLines, (l) => l.includes("elicitation/create"));
    const elicitLine = stdoutLines.find((l) => l.includes("elicitation/create"))!;
    const elicitReq = JSON.parse(elicitLine);
    assert.ok(elicitReq.id, "elicitation request has an id");
    assert.ok(
      elicitReq.params?.requestedSchema?.properties?.ok,
      "elicitation schema has 'ok' field",
    );

    // 4. Respond: accept with ok=true
    send({ jsonrpc: "2.0", id: elicitReq.id, result: {
      action: "accept",
      content: { ok: true },
    } });

    // 5. Poll tasks/get until completed
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while ((status === "working" || status === "input_required") && Date.now() - start < 10_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idM = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
      const getLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working" || status === "input_required") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "completed", "task reached completed");

    // 6. tasks/result
    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idM = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
    const finalText = JSON.parse(resLine).result.content[0].text;
    assert.ok(finalText.includes("deploy-v3"), `result contains input: ${finalText}`);
    assert.ok(finalText.includes("Confirmed"), `result says confirmed: ${finalText}`);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 1b:** Add an e2e test for the decline path:

```typescript
test("plan 9 elicitation decline: elicitation/create -> decline -> rejected", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan9-decline-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan9-decline, version: "0.0.1" }
tasks:
  confirm_workflow:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        elicitation:
          message: "Proceed?"
          schema:
            ok: { type: boolean }
        on:
          - when: { "var": "elicitation.ok" }
            target: done
          - target: rejected
      done:
        mcpStatus: completed
        result:
          text: "Confirmed"
      rejected:
        mcpStatus: failed
        result:
          text: "Declined"
tools:
  - name: confirm
    description: "Confirm"
    execution:
      taskSupport: required
    handler:
      workflow: { ref: confirm_workflow }
`);
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
  child.stderr.on("data", () => {});

  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: {
        tasks: { requests: { tools: { call: true } } },
        elicitation: { form: {} },
      },
      clientInfo: { name: "test-decline", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "confirm",
      arguments: {},
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const taskId = JSON.parse(callLine).result.task?.taskId;
    assert.ok(taskId);

    // Wait for elicitation request
    await waitForLine(stdoutLines, (l) => l.includes("elicitation/create"));
    const elicitLine = stdoutLines.find((l) => l.includes("elicitation/create"))!;
    const elicitId = JSON.parse(elicitLine).id;

    // Decline
    send({ jsonrpc: "2.0", id: elicitId, result: { action: "decline" } });

    // Poll until terminal
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while ((status === "working" || status === "input_required") && Date.now() - start < 10_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idM = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
      const getLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working" || status === "input_required") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "failed", "task reached failed on decline");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idM = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
    const finalText = JSON.parse(resLine).result.content[0].text;
    assert.ok(finalText.includes("Declined"), `result says declined: ${finalText}`);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
```

### Step 2: Run all gates

- [ ] **Step 2a:** Run full test suite + type-check:

Run: `npm run check && npm test`

Expected: All pass (including both new integration tests).

- [ ] **Step 2b:** Run ALL 12 smoke gates:

Run: `just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool && just smoke-task-elicitation`

Expected: All 12 pass. `smoke-task-elicitation` passes for the first time.

### Step 3: Handoff document

- [ ] **Step 3a:** Create `.handoffs/2026-04-16-HHMM-jig-runtime-plan9-complete.md` (use actual time).

Include:
- State: Green — test count, gate count
- What Plan 9 delivered (bulleted)
- Decisions made
- What's next (Plan 10: CLI)
- Landmines
- Gate inventory

- [ ] **Step 4:** Write `commit.txt`:

```
feat(runtime): plan 9 acceptance proof — elicitation smoke + e2e + handoff (#NN)

Adds the Plan 9 elicitation e2e integration tests (accept + decline
paths), verifies the smoke-task-elicitation gate passes, and writes
the handoff document. All 12 smoke gates + full test suite pass.
```

---

## Reminders

- **Phase boundaries are commits.** Each phase ends with a `commit.txt`. Clay runs `gtxt` + `git pm` between phases.
- **SDK quarantine.** `tasks.ts` imports zero symbols from `@modelcontextprotocol/server`. The elicit callback is jig-typed.
- **Drain stderr.** All task tool integration tests and smoke helpers MUST drain stderr to avoid pipe blocking on the experimental-transform-types warnings.
- **`notifications/initialized` required.** Without it, the SDK silently drops `tools/call` for task tools.
- **`elicitation: { form: {} }` in client capabilities.** The initialize request must advertise form elicitation support, otherwise the SDK throws.
- **`child.kill()` in finally blocks.** Task tools keep the event loop alive via InMemoryTaskStore — sendRpc + pipe-close pattern doesn't work.
