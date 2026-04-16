# jig Runtime — Plan 8 (tasks + state machines)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each Phase lands as one commit on a dedicated feature branch; Clay runs `gtxt` + `git pm` between phases.

**Goal:** Add the `tasks:` top-level state-machine block plus `tools[].execution.taskSupport` plus a `workflow:` handler type to the jig runtime. After this plan, an author writes a YAML state machine (states → actions → guarded transitions → terminal `result`), declares `execution: { taskSupport: required }` on a tool, and points the tool's handler at `workflow: { ref: <task_name> }`. The runtime registers the tool via the SDK's `experimental.tasks.registerToolTask`, uses an `InMemoryTaskStore`, and drives the state machine asynchronously while pushing `mcpStatus` updates and a final `result` to the store. `tasks/get` returns live status; `tasks/result` returns the rendered terminal output. Idempotency comes from the store: the same `taskId` always returns the same task object, the same final result.

**Architecture:** Eight phases land in order. (0) This plan doc. (1) **The acceptance artifact set** — land TWO example YAMLs that the rest of the plan exists to make boot: `examples/tasks.yaml` (a dedicated workflow tool — the simple case, validating→enriching→notifying→completed plus a guarded rejected branch) AND `examples/tasks-one-tool.yaml` (the single-tool dispatcher pattern with one workflow case + non-workflow cases — preserves the streamlinear sub-1k-token contract). Both must work for Plan 8 to be done. (2) `execution:` schema on `tools[]` — `ToolDefinition.execution?: ExecutionConfig` with `taskSupport: "required" | "optional"`. (3) `tasks:` top-level state-machine schema — new types in `config.ts`, new `src/runtime/tasks.ts` with `validateTasks`, failing tests in `tests/tasks.test.ts`. (4) SDK adapter — `JigServerHandle.registerToolTask(name, spec, taskHandler)` bridges into `server.experimental.tasks.registerToolTask`; boot creates an `InMemoryTaskStore` and advertises `capabilities.tasks.taskStore`. (5) `workflow:` handler type — new `src/runtime/handlers/workflow.ts` with `invokeWorkflow`; the handler is dispatched only inside the task `createTask` callback (never inline through `invoke()`), runs the state machine via `interpretWorkflow`, and pushes status / result to the request-scoped store. (6) **Simple-case** boot integration — `index.ts` partitions tools by `execution.taskSupport`; task tools whose outer handler is `workflow:` route through `registerToolTask`; non-task tools keep `registerTool`; cross-ref enforces "task tool requires workflow handler" (strict). After this phase, `examples/tasks.yaml` boots. (7) **Dispatcher-task fusion** — relax the cross-ref check so a task tool's outer handler can also be `dispatch:` (with at least one case routing to a workflow); extract `resolveDispatchCase` from `invokeDispatch` into a reusable helper; teach `registerTaskTool` to walk the dispatch tree at `createTask` time, kicking off the interpreter for workflow cases and synchronously running non-workflow cases as one-step tasks (`invoke` + `storeTaskResult`). After this phase, `examples/tasks-one-tool.yaml` boots. (8) `just smoke-task` recipe drives BOTH YAMLs + end-to-end integration tests against BOTH + handoff.

**Tech Stack:** No new production dependencies. `InMemoryTaskStore` is an SDK export; `experimental.tasks.registerToolTask` is the SDK's documented surface for task-based tools. JSONLogic engine (`json-logic-engine` v5) is already in the runtime — Plan 8 reuses it for transition guards. Mustache `render(text, vars)` from `src/runtime/util/template.ts` is jig-owned. TypeScript 6.0+, `node:test`, `yaml`, `@modelcontextprotocol/server@2.0.0-alpha.2` all unchanged.

---

## Scope Note

This is **plan 8 of ~10** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)).

**Planned sequence (updated):**

1. Plan 1 — smoke test (merged)
2. Plan 2 — dispatcher + exec + Mustache (merged)
3. Plan 3 — JSONLogic + compute + guards + transforms + helpers (merged)
4. Plan 4 — connections + http + graphql (merged)
5. Plan 5 — probes (merged)
6. Plan 6 — resources + watchers (merged)
7. Plan 7 — prompts + completions + URI templates (merged)
8. **Plan 8 — tasks + state machines** (this plan)
9. Plan 9 — elicitation (`input_required` states + `elicitation/create` round-trip)
10. Plan 10 — CLI (`jig new|dev|validate|build`) + build pipeline

**Out of scope for Plan 8 (carried to later plans):**

- **Elicitation / `input_required` states** — declared at parse time as a Plan 9 surface. `mcpStatus: input_required` is rejected by the validator with a clear "Plan 9" message; `elicitation:` keys on states are also rejected.
- **`cancelled` mcpStatus as an author-declared terminal state** — `cancelled` is what the SDK records when the *client* calls `tasks/cancel`. Author-declared terminal states are `completed` or `failed` only. Reserved for client-initiated transitions.
- **Structured content in terminal results** — `result: { text }` only in Plan 8. `result: { structured: {...} }` and content-block arrays are deferred.
- **External event triggers** — transitions in v1 fire on action completion (`when:` evaluated against `result`). The `event:` field on a transition is parsed (so YAML stays forward-compatible) but its only role today is documentation; no external `event:` source dispatches it.
- **Task store backends beyond in-memory** — `InMemoryTaskStore` is the only backend in v1. A future plan may add a SQLite or Redis backend behind the same `TaskStore` interface.
- **`tasks/list`** — the SDK's `experimental.tasks` surface includes a `listTasks` method but Plan 8 does not advertise or test it. Single-client stdio doesn't need pagination yet.
- **Persistent task state across restarts** — `InMemoryTaskStore` is process-local; restart wipes all in-flight tasks. Documented as a known v1 limitation.
- **Concurrent action execution within a state** — `actions:` runs sequentially in v1. Parallel action arrays are deferred.

## Key Constraints (enforce throughout)

- **TDD.** Every implementation step is preceded by a failing test and followed by that test passing. Watch the RED before writing GREEN.
- **SDK quarantine holds.** Direct imports of `@modelcontextprotocol/server` stay confined to `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. `src/runtime/tasks.ts` and `src/runtime/handlers/workflow.ts` import types + helpers from `./server.ts`, not from the SDK package. The `experimental.tasks.registerToolTask` adapter and the `InMemoryTaskStore` wiring live in `server.ts`.
- **`execution:` is optional.** A tool without an `execution:` block parses, validates, and registers exactly as before Plan 8 (i.e. through `registerTool`, not `registerToolTask`).
- **`tasks:` is optional.** A config without a `tasks:` block parses and boots normally.
- **`workflow:` handler is task-only.** A tool whose handler is `workflow: { ref: ... }` MUST also declare `execution: { taskSupport: "required" }` (or `"optional"`); a non-task tool with a `workflow:` handler is a parse-time error. The reverse is also enforced: a task tool MUST NOT carry an `inline:`/`exec:`/`dispatch:`/`compute:`/`http:`/`graphql:` handler, only `workflow:`.
- **Cross-ref check.** Every `handler.workflow.ref` must match a declared workflow name in the `tasks:` block. Checked at parse time (after both `tools:` and `tasks:` are validated).
- **`input_required` and `cancelled` mcpStatus values are rejected.** `input_required` returns "Plan 9 (elicitation) hasn't landed yet"; `cancelled` returns "cancelled is client-initiated, not author-declared".
- **`mcpStatus: completed | failed` are terminal.** Terminal states MUST declare `result: { text: ... }` and MUST NOT declare `actions:` or `on:`. Non-terminal states (`mcpStatus: working`) MUST declare `on:` (otherwise the workflow never advances) and MUST NOT declare `result:`.
- **JSONLogic guards.** `on[].when:` is arbitrary JSONLogic. Engine errors at evaluation time become a `failed` task with the engine error as the status message.
- **Workflow context shape:** `{ input, result, probe }`. `input` is the args from `tools/call`. `result` is the most-recent action's parsed result (JSON-parsed text content if it parses, otherwise the raw text). `probe` is the resolved probe map.
- **Status updates are async-fire-and-forget.** The interpreter does not await individual `updateTaskStatus` calls before advancing — failure to push a status update should not abort the workflow. The terminal `storeTaskResult` IS awaited.
- **Action errors are state failures.** If an action returns `isError: true` or throws, the workflow transitions to a synthesized `mcpStatus: failed` terminal with the error text as the result, regardless of what `on:` declared.
- **No new runtime deps.** Node 24+ built-ins + existing deps unchanged.
- **Eleven gates must all pass before the Phase 8 commit:** `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool` (smoke-task drives `examples/tasks.yaml`; smoke-task-one-tool drives `examples/tasks-one-tool.yaml`).
- **Commits via `commit.txt`.** Clay runs `gtxt` + `git pm`. Never `git commit` directly.
- **Specific-path `git add`** — never `-A`.
- **Feature branch per phase.** Branches: `chore/plan8-doc`, `chore/plan8-acceptance-yamls`, `feat/plan8-execution-schema`, `feat/plan8-tasks-schema`, `feat/plan8-task-adapter`, `feat/plan8-workflow-handler`, `feat/plan8-boot-simple`, `feat/plan8-dispatcher-fusion`, `feat/plan8-complete`.
- **Single-tool dispatcher spirit preserved.** Phase 7 (dispatcher-task fusion) is non-negotiable. Without it, jig forces one-tool-per-workflow, which breaks the streamlinear sub-1k-token contract that motivates the project. Both example YAMLs MUST boot before Plan 8 ships.
- **Integration tests carry `{ timeout: 15_000 }`.**
- **`.handoffs/` timestamp in Eastern Time.** Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before creating the handoff file.

## File Structure

```
jig/
  record/
    plans/
      2026-04-15-jig-runtime-plan8.md                  # this plan (Phase 0)
  src/
    runtime/
      tasks.ts                                          # NEW — validateTasks +
                                                        #   interpretWorkflow (Phases 3, 5)
      config.ts                                         # + ExecutionConfig, ToolDefinition.execution,
                                                        #   StateSpec, TransitionSpec, WorkflowSpec,
                                                        #   TasksConfig, WorkflowHandler, Handler union
                                                        #   extension, cross-ref check
                                                        #   (strict in Phase 6, relaxed in Phase 7)
      server.ts                                         # + registerToolTask adapter,
                                                        #   InMemoryTaskStore wiring (Phase 4)
      index.ts                                          # + boot-time partition of tools by
                                                        #   execution.taskSupport (Phase 6); +
                                                        #   dispatcher-task fusion in createTask
                                                        #   (Phase 7)
      handlers/
        workflow.ts                                     # NEW — invokeWorkflow handler
                                                        #   (Phase 5; never reached via
                                                        #   handlers/index.ts invoke())
        dispatch.ts                                     # + extract resolveDispatchCase helper
                                                        #   for reuse from boot fusion (Phase 7)
        index.ts                                        # + reject workflow: in invoke()
                                                        #   with "task-only handler" error (Phase 5)
        types.ts                                        # (no change — InvokeContext stable)
  tests/
    tasks.test.ts                                       # NEW — schema validator + interpreter
                                                        #   unit tests (Phases 3, 5)
    config.test.ts                                      # + execution: tests, cross-ref tests
                                                        #   (strict Phase 6, relaxed Phase 7)
    integration.test.ts                                 # + tools/call task creation, tasks/get,
                                                        #   tasks/result, e2e workflow against
                                                        #   both example YAMLs (Phases 6, 7, 8)
  examples/
    tasks.yaml                                          # NEW — workflow-tool acceptance
                                                        #   artifact (Phase 1)
    tasks-one-tool.yaml                                 # NEW — single-tool dispatcher
                                                        #   acceptance artifact (Phase 1)
  justfile                                              # + smoke-task + smoke-task-one-tool
                                                        #   recipes (Phase 8)
  .handoffs/
    YYYY-MM-DD-HHMM-jig-runtime-plan8-complete.md       # NEW (Phase 8)
```

**Not in Plan 8:** `src/runtime/elicitation.ts`, `src/cli/`. Those arrive in Plans 9, 10.

---

## Phase 0: Land this plan doc

**Intent:** Commit Plan 8 to `record/plans/` so subsequent phases can reference it by absolute repo path.

**Branch:** `chore/plan8-doc`

### Task 0.1: Write `commit.txt`

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: land plan 8 (tasks + state machines)

Phase 0 of jig runtime Plan 8 — the plan doc itself. Subsequent
phases land on chore/plan8-acceptance-yamls,
feat/plan8-execution-schema, feat/plan8-tasks-schema,
feat/plan8-task-adapter, feat/plan8-workflow-handler,
feat/plan8-boot-simple, feat/plan8-dispatcher-fusion,
feat/plan8-complete.

Plan 8 delivers: tools[].execution.taskSupport ("required" |
"optional") opting tools into the MCP experimental task lifecycle;
tasks: top-level block of named state-machine workflows (states,
guarded transitions, sequential actions, terminal results);
workflow: handler type that routes a task tool through the
state-machine interpreter; boot wiring that partitions tools by
execution.taskSupport and registers task tools via the SDK's
experimental.tasks.registerToolTask + InMemoryTaskStore;
dispatcher-task fusion that lets a single dispatcher tool route
some actions to workflows and others to one-shot handlers,
preserving the streamlinear sub-1k-token contract.

Plan 8 is YAML-first: Phase 1 lands TWO example YAMLs as the
acceptance artifact set. examples/tasks.yaml is the dedicated
workflow tool (5-state process_job: validating → enriching →
notifying → completed, plus a rejected branch via JSONLogic
guard). examples/tasks-one-tool.yaml is the single-tool
dispatcher pattern (one MCP tool whose dispatch cases include
help/list/run, where run routes to a workflow and the others
return synchronously). Both must boot for Plan 8 to be done.

Out of scope per the scope note: input_required mcpStatus and
elicitation: blocks on states (Plan 9); author-declared cancelled
terminal state (client-initiated only); structured content in
terminal results; external event triggers; persistent task store
backends; tasks/list pagination; concurrent actions within a state.
```

- [ ] **Step 2: Stage with specific path and commit**

Stage: `git add record/plans/2026-04-15-jig-runtime-plan8.md`

Clay: `gtxt && git pm`

Expected: Plan 8 doc merges to `main` as its own PR. `git log --oneline` shows the new commit.

---

## Phase 1: Land the acceptance artifact set (`examples/tasks.yaml` + `examples/tasks-one-tool.yaml`)

**Intent:** Plan 8 is YAML-first. Before any schema or interpreter work, land BOTH canonical example YAMLs so every subsequent phase has concrete targets to roll up to. Neither YAML parses yet — `execution:` (Phase 2), `tasks:` (Phase 3), and `workflow:` (Phase 5) are all still unrecognized; the dispatcher-with-workflow-case shape requires Phase 7 fusion — but committing them now establishes the contract: "the plan is done when both YAMLs boot and the lifecycles below work against them."

**Acceptance test of "Plan 8 done" — TWO YAMLs, both must boot:**

**(A) `examples/tasks.yaml` — dedicated workflow tool:**

```bash
node --experimental-transform-types src/runtime/index.ts --config examples/tasks.yaml
```

…boots clean, then:

1. `initialize` advertises `capabilities.tasks` (because `InMemoryTaskStore` is wired).
2. `tools/list` shows ONE tool: `process_job`.
3. `tools/call process_job { jobId: "j-42" }` returns `{ task: { taskId: ..., status: "working" | "completed" } }` (a `CreateTaskResult`, NOT a `CallToolResult`).
4. `tasks/get { taskId }` polled until `status: "completed"` returns the live `Task`.
5. `tasks/result { taskId }` returns the rendered terminal text (`Job j-42 processed.\nNotification posted to: #ops.\n`).

Driven by `just smoke-task` (Phase 8). After Phase 6.

**(B) `examples/tasks-one-tool.yaml` — single-tool dispatcher with workflow case:**

```bash
node --experimental-transform-types src/runtime/index.ts --config examples/tasks-one-tool.yaml
```

…boots clean, then:

1. `initialize` advertises `capabilities.tasks`.
2. `tools/list` shows ONE tool: `jobs` (preserving the streamlinear single-tool pattern).
3. `tools/call jobs { action: "help" }` returns a `CreateTaskResult` whose task immediately reaches `completed` with the help text (synthetic one-step task — non-workflow case wrapped at boot).
4. `tools/call jobs { action: "run", jobId: "j-42" }` returns a `CreateTaskResult`; `tasks/get` polled until `completed`; `tasks/result` returns the workflow's rendered terminal text.

Driven by `just smoke-task-one-tool` (Phase 8). After Phase 7.

**Branch:** `chore/plan8-acceptance-yamls`

### Task 1.1: Create `examples/tasks.yaml`

**Files:**
- Create: `examples/tasks.yaml`

- [ ] **Step 1: Write the YAML**

```yaml
# A Plan 8 example exercising the tasks: + execution: + workflow: surfaces.
# Demonstrates:
#   - tasks: top-level state-machine workflow with one happy path and
#     one guarded failure branch
#   - sequential actions in a state (parse then validate)
#   - JSONLogic guard on a transition (when result.valid is false → reject)
#   - terminal completed and failed states with rendered results
#   - execution.taskSupport on a tool that opts into the task lifecycle
#   - handler: { workflow: { ref: process_job } } routing
#
# Run with `just smoke-task`. Hermetic — no network, all inline handlers.
# Real-world workflows would replace inline: actions with exec: calls to
# sibling binaries; that pattern lands with the elicitation example in
# Plan 9 so Plan 8 stays focused on the state-machine surface itself.
#
# NOTE: action results are JSON-parsed before binding to workflow.result.
# Inline text '{"valid": true}' parses to { valid: true } so the guard
# { "var": "result.valid" } evaluates correctly.
#
# NOTE: workflow.result holds the MOST RECENT action's output — it is NOT
# accumulated across states. The completed state's terminal text below
# only references result fields produced by the notifying state's action
# (the last one to run). To carry data forward across states in v1, the
# pattern is to re-emit needed fields from each state's last action.

server:
  name: jig-plan8-example
  version: "1.0.0"
  description: |
    Demonstrates Plan 8: a process_job workflow with sequential
    validation, branching on input quality, enrichment, and a
    rendered terminal result.

tasks:
  process_job:
    initial: validating

    states:
      validating:
        mcpStatus: working
        statusMessage: "Validating job input"
        actions:
          # Two sequential actions: parse the input, then schema-check it.
          # Last action's result becomes workflow.result; the guard below
          # uses result.valid to choose the next state.
          - inline:
              text: '{"parsed": true, "fields": ["jobId", "payload"]}'
          - inline:
              text: '{"valid": true, "issues": []}'
        on:
          - when: { "==": [{ var: "result.valid" }, false] }
            target: rejected
          - target: enriching

      enriching:
        mcpStatus: working
        statusMessage: "Enriching with metadata"
        actions:
          - inline:
              text: '{"enriched": true, "stamp": "2026-04-15T20:00:00Z", "owner": "ops"}'
        on:
          - target: notifying

      notifying:
        mcpStatus: working
        statusMessage: "Posting completion notice"
        actions:
          - inline:
              text: '{"posted": true, "channel": "#ops"}'
        on:
          - target: completed

      completed:
        mcpStatus: completed
        result:
          text: |
            Job {{input.jobId}} processed.
            Notification posted to: {{result.channel}}.

      rejected:
        mcpStatus: failed
        result:
          text: |
            Job {{input.jobId}} rejected at validation.

tools:
  - name: process_job
    description: "Run a job through the validate → enrich → notify pipeline."
    input:
      jobId:
        type: string
        required: true
    execution:
      taskSupport: required
    handler:
      workflow:
        ref: process_job
        ttl_ms: 60000
```

- [ ] **Step 2: Verify it does NOT yet parse (sanity check)**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/tasks.yaml < /dev/null 2>&1 | head -3`

Expected: a parse error pointing at `execution:` or `tasks:` or `workflow:` (the first unrecognized key the validator hits). This confirms (a) the YAML reaches the validator and (b) Phases 2-6 (schema → adapter → interpreter → cross-ref/boot) actually have something to do. Save the error message — the same command after Phase 6 lands should boot clean.

### Task 1.2: Create `examples/tasks-one-tool.yaml`

**Files:**
- Create: `examples/tasks-one-tool.yaml`

- [ ] **Step 1: Write the YAML**

```yaml
# A Plan 8 example demonstrating the SINGLE-TOOL DISPATCHER pattern with
# state-machine workflows. This preserves the streamlinear sub-1k-token
# contract that motivates jig: ONE MCP tool serves multiple actions.
# Different actions can be different shapes — some return synchronously
# (help, list), some kick off a multi-state workflow (run).
#
# The shape lands in Phase 7 (dispatcher-task fusion). Phase 6 alone
# rejects this YAML at the cross-ref check ("task tool requires workflow
# handler") because it expects the OUTER handler to be workflow:. Phase 7
# relaxes that check to allow OUTER handler = dispatch: with at least one
# case routing to a workflow.
#
# Run with `just smoke-task-one-tool`. Hermetic — no network, all inline
# handlers.
#
# DESIGN NOTES:
#   - tools/list shows ONE tool ("jobs"), not three. The action enum is
#     synthesized from the dispatch case names.
#   - execution.taskSupport: optional means the SDK negotiates with the
#     client. Task-aware clients get CreateTaskResult; non-task clients
#     get the SDK's auto-poll-to-completion behavior.
#   - Non-workflow cases (help, list) become "synthetic one-step tasks"
#     at boot — the createTask callback invokes them via the existing
#     handlers/index.ts invoke(), then immediately calls
#     storeTaskResult. Clients see a task that's already completed by
#     the time tasks/get is called.
#   - The workflow case (run) drives interpretWorkflow, same as
#     examples/tasks.yaml's dedicated workflow tool.

server:
  name: jig-plan8-onetool
  version: "1.0.0"
  description: |
    Demonstrates Plan 8's single-tool dispatcher pattern: one MCP
    tool whose dispatch cases mix synchronous handlers (help, list)
    with a state-machine workflow (run).

tasks:
  process_job:
    initial: validating

    states:
      validating:
        mcpStatus: working
        statusMessage: "Validating job input"
        actions:
          - inline:
              text: '{"valid": true}'
        on:
          - when: { "==": [{ var: "result.valid" }, false] }
            target: rejected
          - target: notifying

      notifying:
        mcpStatus: working
        statusMessage: "Posting completion notice"
        actions:
          - inline:
              text: '{"posted": true, "channel": "#ops"}'
        on:
          - target: completed

      completed:
        mcpStatus: completed
        result:
          text: |
            Job {{input.jobId}} processed.
            Notification posted to: {{result.channel}}.

      rejected:
        mcpStatus: failed
        result:
          text: |
            Job {{input.jobId}} rejected at validation.

tools:
  - name: jobs
    description: |
      Jobs management — single MCP tool, multiple actions.

      {"action":"help"}                    → docs (synchronous)
      {"action":"list"}                    → list pending jobs (synchronous)
      {"action":"run", "jobId":"j-42"}     → kick off the validate→notify
                                             workflow (returns a task)

    input:
      action:
        type: string
        required: true
      jobId:
        type: string
        description: "Required for action=run"

    execution:
      taskSupport: optional

    handler:
      dispatch:
        on: action
        help:
          handler:
            inline:
              text: |
                jobs management. Actions: help, list, run.

                  {"action":"list"}                   → list pending jobs
                  {"action":"run", "jobId":"j-42"}    → kick off processing
        list:
          handler:
            inline:
              text: '[{"jobId": "j-1", "status": "pending"}]'
        run:
          requires: [jobId]
          handler:
            workflow:
              ref: process_job
              ttl_ms: 60000
```

- [ ] **Step 2: Verify it does NOT yet parse (sanity check)**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/tasks-one-tool.yaml < /dev/null 2>&1 | head -3`

Expected: a parse error pointing at `execution:` or `tasks:` or `workflow:` (whichever the validator hits first). Same as the simple YAML — neither parses yet, but both will after Phase 7.

### Task 1.3: Run the existing gate suite to confirm Phase 1 doesn't regress anything

- [ ] **Step 1: Run every existing gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all 9 PASS — landing a YAML file does not change any existing test or recipe.

### Task 1.4: Commit both artifacts

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore(examples): land plan 8 acceptance artifact set

Phase 1 of Plan 8. Two example YAMLs become the YAML-first
contract; the rest of the plan exists to make BOTH boot.

  - examples/tasks.yaml: dedicated workflow tool. 5-state
    process_job workflow (validating → enriching → notifying →
    completed, plus a guarded rejected failure branch). One MCP
    tool, one shape: handler is workflow:. Phase 6 makes this
    boot.
  - examples/tasks-one-tool.yaml: single-tool dispatcher pattern.
    One MCP tool ("jobs") whose dispatch cases mix synchronous
    handlers (help, list) with a workflow case (run). Preserves
    the streamlinear sub-1k-token contract: one tools/list entry,
    multiple actions, one of which is a state machine. Phase 7
    (dispatcher-task fusion) makes this boot.

Neither YAML parses yet — execution:, tasks:, and workflow: are
unrecognized keys until Phases 2, 3, and 5 land their respective
schemas; the dispatcher-with-workflow-case shape needs the
relaxed cross-ref check from Phase 7. Acceptance test (Plan 8
done): both YAMLs boot, smoke-task and smoke-task-one-tool both
green.

Real-world workflows would replace inline: actions with exec: to
sibling binaries; that pattern lands with the Plan 9 elicitation
example so Plan 8 stays focused on the state-machine and
dispatcher-fusion surfaces themselves.

No source or test changes — chore-only, gates unchanged at 9.
```

- [ ] **Step 2: Stage with specific paths and commit**

```bash
git add \
  examples/tasks.yaml \
  examples/tasks-one-tool.yaml
```

Clay: `gtxt && git pm`

Expected: Phase 1 merges to main. Both acceptance YAMLs are now in tree as the contract for Phases 2-8.

---

## Phase 2: `execution:` schema on `tools[]`

**Intent:** Land the `execution:` field on `ToolDefinition`. After this phase, `parseConfig()` on a YAML with a tool carrying `execution: { taskSupport: "required" }` returns a typed `ToolDefinition.execution: ExecutionConfig | undefined`. Validation enforces: `taskSupport` is required-when-`execution`-is-present and is one of `"required" | "optional"`. No registration changes — Phase 6 partitions tools by this field. Phase 2 only lands the schema. After this phase, parsing `examples/tasks.yaml` advances past the `execution:` block (next failure: unknown key `tasks:`).

**Branch:** `feat/plan8-execution-schema`

### Task 1.1: Add `ExecutionConfig` type and extend `ToolDefinition` in `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the type after `InputFieldSchema`**

Search for `export interface InputFieldSchema {` and insert after the closing brace:

```typescript
/**
 * Tool execution mode. Plan 8: present on tools that opt into the MCP
 * experimental task lifecycle. `taskSupport: "required"` means the tool
 * MUST be invoked as a task (clients without task support get an error);
 * `"optional"` means clients may invoke either as task or as plain
 * tools/call (the SDK auto-polls for the latter). `"forbidden"` is not
 * accepted — omit the execution: block to declare a non-task tool.
 *
 * Plan 8 only wires task tools whose handler is `workflow:`. Non-workflow
 * task tools are rejected at parse time as a v1 scope limitation.
 */
export interface ExecutionConfig {
  taskSupport: "required" | "optional";
}
```

- [ ] **Step 2: Extend `ToolDefinition` with the optional field**

Find `export interface ToolDefinition {` and add after `transform?: JsonLogicRule;` (insert before the closing brace):

```typescript
  /** Task execution mode. When present, the tool registers via the SDK's
   * experimental.tasks.registerToolTask path instead of registerTool. */
  execution?: ExecutionConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — types compile, no consumers yet.

### Task 1.2: Write failing tests — the validator contract

**Files:**
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Append execution-schema tests**

At the bottom of `tests/config.test.ts`, append:

```typescript
test("config accepts a tool with execution.taskSupport: required", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: longjob
    description: "Long-running job"
    execution:
      taskSupport: required
    handler:
      inline: { text: ok }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools.length, 1);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "required");
});

test("config accepts a tool with execution.taskSupport: optional", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: pollable
    description: "May be called either way"
    execution:
      taskSupport: optional
    handler:
      inline: { text: ok }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
});

test("config accepts a tool without execution: (default = non-task)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: plain
    description: "Plain tool"
    handler:
      inline: { text: ok }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution, undefined);
});

test("config rejects execution: that isn't a mapping", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution: required
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution must be a mapping/);
});

test("config rejects execution: with no taskSupport", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution: {}
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution\.taskSupport is required/);
});

test("config rejects execution.taskSupport: forbidden", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: forbidden
    handler:
      inline: { text: ok }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /taskSupport must be one of "required", "optional"/,
  );
});

test("config rejects execution.taskSupport: bogus value", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: maybe
    handler:
      inline: { text: ok }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /taskSupport must be one of "required", "optional"/,
  );
});

test("config rejects execution: with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
      bogus: 42
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution: unknown key "bogus"/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="execution"`
Expected: all eight tests FAIL — `validateTool` doesn't yet wire the `execution:` field.

### Task 1.3: Wire `validateExecution` into `validateTool`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add `validateExecution` helper**

After `validateTool` and before `validateInput`, add:

```typescript
function validateExecution(v: unknown, toolName: string): ExecutionConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].execution must be a mapping`);
  }
  const e = v as Record<string, unknown>;

  const known = new Set(["taskSupport"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(`config: tools[${toolName}].execution: unknown key "${key}"`);
    }
  }

  if (e["taskSupport"] === undefined) {
    throw new Error(`config: tools[${toolName}].execution.taskSupport is required`);
  }
  const ts = e["taskSupport"];
  if (ts !== "required" && ts !== "optional") {
    throw new Error(
      `config: tools[${toolName}].execution.taskSupport must be one of "required", "optional" (got ${JSON.stringify(ts)})`,
    );
  }

  return { taskSupport: ts };
}
```

- [ ] **Step 2: Call `validateExecution` from `validateTool`**

Find the `validateTool` function. Locate the block that starts:

```typescript
  const transformRaw = t["transform"];
  const tool: ToolDefinition = {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler,
  };
  if (transformRaw !== undefined) {
```

Replace the block (up to and including the existing `if (transformRaw !== undefined)` and its body) with:

```typescript
  const transformRaw = t["transform"];
  const execution = validateExecution(t["execution"], t["name"]);
  const tool: ToolDefinition = {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler,
  };
  if (transformRaw !== undefined) {
    // No structural validation — any valid JSONLogic is accepted. Engine
    // errors at invocation time become isError tool results.
    tool.transform = transformRaw as JsonLogicRule;
  }
  if (execution !== undefined) {
    tool.execution = execution;
  }
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- --test-name-pattern="execution"`
Expected: all eight Phase-1 tests PASS.

Run: `npm run check`
Expected: PASS.

### Task 1.4: Run the full gate suite and commit

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS (9 gates — smoke-task doesn't exist yet).

- [ ] **Step 2: Write the commit message**

```
feat(runtime): tools[].execution.taskSupport schema + validator

Phase 2 of Plan 8 — Tasks + State Machines. Lands the optional
execution: block on tool definitions as a typed
ToolDefinition.execution: ExecutionConfig | undefined, fully
validated at parseConfig time.

Schema:
  - execution is undefined OR a mapping
  - execution.taskSupport is required when execution is present and
    must be one of "required" | "optional"
  - "forbidden" is rejected (omit the execution: block to declare a
    non-task tool)
  - unknown keys at the top level of execution are rejected

No registration behavior yet — Phase 6 partitions tools by this
field and routes task tools through registerToolTask. Plan 8's
workflow: handler in Phase 5 will be the only handler type allowed
on a task tool.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/config.ts \
  tests/config.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 2 merges to main.

---

## Phase 3: `tasks:` top-level state-machine schema + validator

**Intent:** Land the schema. After this phase, `parseConfig()` on a YAML with a `tasks:` block returns a typed `JigConfig.tasks: TasksConfig | undefined`. All validation rules enforced: workflow name uniqueness, `initial:` state must exist, every state's `mcpStatus` must be `working | completed | failed` (others rejected with helpful messages), terminal states must declare `result:` and must NOT declare `actions:` or `on:`, non-terminal states must declare `on:` and must NOT declare `result:`, transition `target:` must reference a declared state. No runtime behavior — Phase 4 builds the interpreter.

**Branch:** `feat/plan8-tasks-schema`

### Task 2.1: Add `WorkflowSpec` / `StateSpec` / `TransitionSpec` / `TasksConfig` types to `config.ts`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the types after `CompletionsConfig`**

Search for `export interface CompletionsConfig {` and locate the closing brace plus the `}` line. Insert after it:

```typescript
/**
 * One transition out of a state. Evaluated in declaration order; the first
 * matching transition fires. A transition with no `when:` always matches.
 *
 * `event:` is reserved for forward compatibility (future external triggers).
 * Plan 8 transitions all fire on action completion; `event:` is currently a
 * documentation-only field.
 */
export interface TransitionSpec {
  event?: string;
  target: string;
  when?: JsonLogicRule;
}

/**
 * One state in a workflow. Two shapes:
 *   - non-terminal (mcpStatus: "working") — declares actions: and on:;
 *     MUST NOT declare result:
 *   - terminal (mcpStatus: "completed" | "failed") — declares result:;
 *     MUST NOT declare actions: or on:
 *
 * The validator enforces the shape at parse time so the interpreter can
 * trust state.actions / state.on / state.result without re-checking.
 */
export interface StateSpec {
  mcpStatus: "working" | "completed" | "failed";
  statusMessage?: string;
  actions?: Handler[];
  on?: TransitionSpec[];
  result?: { text: string };
}

export interface WorkflowSpec {
  initial: string;
  states: Record<string, StateSpec>;
}

/** Top-level tasks: block — workflow definitions keyed by name. */
export type TasksConfig = Record<string, WorkflowSpec>;
```

- [ ] **Step 2: Extend `JigConfig` with the optional field**

Find `export interface JigConfig {` and add after `completions?:`:

```typescript
  /** State-machine workflows referenced by workflow: handlers. */
  tasks?: TasksConfig;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — types compile, no consumers yet.

### Task 2.2: Write failing tests — the validator contract

**Files:**
- Create: `tests/tasks.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a tasks: block with a single workflow", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  process_job:
    initial: queued
    states:
      queued:
        mcpStatus: working
        statusMessage: "Queued"
        actions:
          - inline: { text: started }
        on:
          - target: done
      done:
        mcpStatus: completed
        result:
          text: "Job complete"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.tasks, "tasks must be present");
  const w = cfg.tasks["process_job"]!;
  assert.equal(w.initial, "queued");
  assert.equal(Object.keys(w.states).length, 2);
  assert.equal(w.states["queued"]!.mcpStatus, "working");
  assert.equal(w.states["queued"]!.statusMessage, "Queued");
  assert.equal(w.states["queued"]!.actions!.length, 1);
  assert.equal(w.states["queued"]!.on!.length, 1);
  assert.equal(w.states["queued"]!.on![0]!.target, "done");
  assert.equal(w.states["done"]!.mcpStatus, "completed");
  assert.equal(w.states["done"]!.result!.text, "Job complete");
});

test("config accepts absent tasks: block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tasks, undefined);
});

test("config rejects tasks: that isn't a mapping", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks: [a, b]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks must be a mapping/);
});

test("config rejects a workflow without initial:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks\.w\.initial is required/);
});

test("config rejects a workflow whose initial: is not a declared state", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: missing
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.initial "missing" is not a declared state/,
  );
});

test("config rejects a workflow with no states:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks\.w\.states is required/);
});

test("config rejects a state with mcpStatus: input_required", () => {
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
    /input_required.*Plan 9/i,
  );
});

test("config rejects a state with mcpStatus: cancelled", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: cancelled
        result: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /cancelled.*client-initiated/i,
  );
});

test("config rejects a state with bogus mcpStatus", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: bogus
        result: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /mcpStatus must be one of "working", "completed", "failed"/,
  );
});

test("config rejects a terminal state without result:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*result.*required/i,
  );
});

test("config rejects a terminal state that declares actions:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
        result: { text: x }
        actions:
          - inline: { text: nope }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*MUST NOT declare actions/i,
  );
});

test("config rejects a terminal state that declares on:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
        result: { text: x }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: y } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*MUST NOT declare on/i,
  );
});

test("config rejects a non-terminal state without on:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        actions:
          - inline: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*non-terminal.*on.*required/i,
  );
});

test("config rejects a non-terminal state that declares result:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
        result: { text: nope }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*non-terminal.*MUST NOT declare result/i,
  );
});

test("config rejects a transition whose target: is not a declared state", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: nowhere
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]\.target "nowhere" is not a declared state/,
  );
});

test("config rejects a state with elicitation: (Plan 9)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        elicitation:
          message: "approve?"
          schema:
            approved: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation.*Plan 9/i,
  );
});

test("config rejects a state with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
        bogus: 42
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a: unknown key "bogus"/,
  );
});

test("config rejects a transition with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
            sneaky: yes
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]: unknown key "sneaky"/,
  );
});

test("config rejects a transition with no target:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - when: { "==": [1, 1] }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]\.target is required/,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-file-pattern="tests/tasks.test.ts"`

If your `node --test` doesn't accept `--test-file-pattern`, fall back to:

Run: `npm test -- --test-name-pattern="tasks:|workflow|state|transition"`

Expected: all tests FAIL — `parseConfig` does not yet wire the `tasks:` block.

### Task 2.3: Scaffold `src/runtime/tasks.ts` with `validateTasks`

**Files:**
- Create: `src/runtime/tasks.ts`
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Create `src/runtime/tasks.ts`**

```typescript
import type {
  Handler,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";

const STATE_KNOWN = new Set([
  "mcpStatus",
  "statusMessage",
  "actions",
  "on",
  "result",
]);

const TRANSITION_KNOWN = new Set(["event", "target", "when"]);

const WORKFLOW_KNOWN = new Set(["initial", "states"]);

/**
 * Validate the top-level `tasks:` block.
 *
 * Rules:
 *   - tasks is undefined OR a mapping of workflowName -> WorkflowSpec
 *   - each workflow: initial (required, must reference a declared state),
 *     states (required, mapping of stateName -> StateSpec)
 *   - each state: mcpStatus (required, one of "working" | "completed" |
 *     "failed"), statusMessage (optional), actions (optional Handler[]),
 *     on (optional TransitionSpec[]), result (optional { text })
 *   - terminal states (mcpStatus: completed | failed) MUST declare result
 *     and MUST NOT declare actions or on
 *   - non-terminal states (mcpStatus: working) MUST declare on and MUST
 *     NOT declare result; actions is optional but typical
 *   - transitions: target (required, must reference a declared state),
 *     event (optional string, reserved for forward compat), when (optional
 *     JSONLogic, no structural validation)
 *   - mcpStatus: input_required → rejected with "Plan 9"
 *   - mcpStatus: cancelled → rejected with "client-initiated"
 *   - elicitation: key on state → rejected with "Plan 9"
 *   - unknown keys rejected at workflow, state, and transition levels
 *
 * `validateHandler` is passed in by the caller (config.ts) to avoid
 * importing from config.ts itself (would be circular). Each action's
 * handler is delegated to that validator under the owner label
 * `tasks.<workflow>.states.<state>.actions[i]`.
 */
export function validateTasks(
  v: unknown,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): TasksConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: tasks must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: TasksConfig = {};
  for (const [workflowName, workflowEntry] of Object.entries(raw)) {
    out[workflowName] = validateWorkflow(workflowEntry, workflowName, validateHandler);
  }
  return out;
}

function validateWorkflow(
  entry: unknown,
  name: string,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): WorkflowSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${name} must be a mapping`);
  }
  const w = entry as Record<string, unknown>;

  for (const key of Object.keys(w)) {
    if (!WORKFLOW_KNOWN.has(key)) {
      throw new Error(`config: tasks.${name}: unknown key "${key}"`);
    }
  }

  if (typeof w["initial"] !== "string" || w["initial"].length === 0) {
    throw new Error(`config: tasks.${name}.initial is required and must be a non-empty string`);
  }
  const initial = w["initial"];

  if (!w["states"] || typeof w["states"] !== "object" || Array.isArray(w["states"])) {
    throw new Error(`config: tasks.${name}.states is required and must be a mapping`);
  }
  const rawStates = w["states"] as Record<string, unknown>;

  // First pass: collect state names so transition target checks can run.
  const stateNames = new Set(Object.keys(rawStates));

  if (!stateNames.has(initial)) {
    throw new Error(
      `config: tasks.${name}.initial "${initial}" is not a declared state`,
    );
  }

  // Second pass: validate each state with the state-name set in hand.
  const states: Record<string, StateSpec> = {};
  for (const [stateName, stateEntry] of Object.entries(rawStates)) {
    states[stateName] = validateState(
      stateEntry,
      name,
      stateName,
      stateNames,
      validateHandler,
    );
  }

  return { initial, states };
}

function validateState(
  entry: unknown,
  workflowName: string,
  stateName: string,
  declaredStateNames: Set<string>,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): StateSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${workflowName}.states.${stateName} must be a mapping`);
  }
  const s = entry as Record<string, unknown>;

  // Reject the Plan-9 elicitation: key explicitly so the error names the plan.
  if ("elicitation" in s) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: blocks land in Plan 9 (input_required + elicitation/create round-trip). Remove the elicitation: key.`,
    );
  }

  for (const key of Object.keys(s)) {
    if (!STATE_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: unknown key "${key}"`,
      );
    }
  }

  const mcpStatusRaw = s["mcpStatus"];
  if (mcpStatusRaw === "input_required") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "input_required" lands in Plan 9 (elicitation). Use working/completed/failed in Plan 8.`,
    );
  }
  if (mcpStatusRaw === "cancelled") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "cancelled" is client-initiated only — set by the SDK when tasks/cancel is called. Authors cannot declare it as a terminal state.`,
    );
  }
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

  const isTerminal = mcpStatus === "completed" || mcpStatus === "failed";

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
  } else {
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

  // Field validation.
  const out: StateSpec = { mcpStatus };

  if (s["statusMessage"] !== undefined) {
    if (typeof s["statusMessage"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.statusMessage must be a string`,
      );
    }
    out.statusMessage = s["statusMessage"];
  }

  if (s["actions"] !== undefined) {
    if (!Array.isArray(s["actions"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.actions must be an array`,
      );
    }
    const actions: Handler[] = [];
    for (let i = 0; i < s["actions"].length; i++) {
      actions.push(
        validateHandler(
          s["actions"][i],
          `tasks.${workflowName}.states.${stateName}.actions[${i}]`,
        ),
      );
    }
    out.actions = actions;
  }

  if (s["on"] !== undefined) {
    if (!Array.isArray(s["on"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on must be an array`,
      );
    }
    const transitions: TransitionSpec[] = [];
    for (let i = 0; i < s["on"].length; i++) {
      transitions.push(
        validateTransition(
          s["on"][i],
          workflowName,
          stateName,
          i,
          declaredStateNames,
        ),
      );
    }
    out.on = transitions;
  }

  if (s["result"] !== undefined) {
    const r = s["result"] as Record<string, unknown>;
    if (typeof r["text"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.result.text must be a string`,
      );
    }
    // Reject unknown keys on result so future structured-content shapes
    // surface as parse errors instead of silently ignored.
    for (const key of Object.keys(r)) {
      if (key !== "text") {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.result: unknown key "${key}" (only "text" is supported in v1)`,
        );
      }
    }
    out.result = { text: r["text"] };
  }

  return out;
}

function validateTransition(
  entry: unknown,
  workflowName: string,
  stateName: string,
  index: number,
  declaredStateNames: Set<string>,
): TransitionSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}] must be a mapping`,
    );
  }
  const t = entry as Record<string, unknown>;

  for (const key of Object.keys(t)) {
    if (!TRANSITION_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}]: unknown key "${key}"`,
      );
    }
  }

  if (typeof t["target"] !== "string" || t["target"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target is required and must be a non-empty string`,
    );
  }
  const target = t["target"];
  if (!declaredStateNames.has(target)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target "${target}" is not a declared state`,
    );
  }

  const out: TransitionSpec = { target };
  if (t["event"] !== undefined) {
    if (typeof t["event"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}].event must be a string`,
      );
    }
    out.event = t["event"];
  }
  if (t["when"] !== undefined) {
    out.when = t["when"] as JsonLogicRule;
  }
  return out;
}
```

- [ ] **Step 2: Wire `validateTasks` into `parseConfig`**

Add the import at the top of `src/runtime/config.ts` alongside the existing runtime imports:

```typescript
import { validateTasks } from "./tasks.ts";
```

Find the `parseConfig` function body. After `const completions = validateCompletions(...)`:

```typescript
const tasks = validateTasks(obj["tasks"], (h, owner) => validateHandlerPublic(h, owner));
```

After `if (completions !== undefined) result.completions = completions;`:

```typescript
if (tasks !== undefined) result.tasks = tasks;
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: all Phase-2 tests PASS (every test in `tests/tasks.test.ts` plus all prior tests).

Run: `npm run check`
Expected: PASS.

### Task 2.4: Run the full gate suite and commit

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS (9 gates).

- [ ] **Step 2: Write the commit message**

```
feat(runtime): tasks: state-machine schema + validator

Phase 3 of Plan 8. Lands the top-level optional tasks: block as a
typed JigConfig.tasks: TasksConfig | undefined, fully validated at
parseConfig time.

Schema:
  - tasks is undefined OR a mapping of workflowName -> WorkflowSpec
  - WorkflowSpec.initial: required, must reference a declared state
  - WorkflowSpec.states: required, mapping of stateName -> StateSpec
  - StateSpec.mcpStatus: required, one of "working" | "completed" |
    "failed" (input_required rejected as Plan 9, cancelled rejected
    as client-initiated, elicitation: key rejected as Plan 9)
  - terminal states (completed | failed) MUST declare result.text
    and MUST NOT declare actions or on
  - non-terminal states (working) MUST declare on (so they can
    advance) and MUST NOT declare result
  - TransitionSpec.target: required, must reference a declared
    state; event optional (forward-compat); when optional JSONLogic
  - actions delegate to the existing validateHandler so any
    inline/exec/dispatch/compute/http/graphql works
  - unknown keys rejected at workflow, state, transition, and
    result levels

No runtime behavior yet. The interpreter lands in Phase 5; the
SDK adapter in Phase 4.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/tasks.ts \
  src/runtime/config.ts \
  tests/tasks.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 3 merges to main.

---

## Phase 4: SDK adapter — `registerToolTask` + `InMemoryTaskStore` wiring

**Intent:** After this phase, `JigServerHandle.registerToolTask(name, spec, taskHandler)` exists and forwards into the SDK's `server.experimental.tasks.registerToolTask`. The boot path advertises `capabilities.tasks` with an `InMemoryTaskStore` instance. No tools register through this path yet — Phase 6 wires the partition. Phase 4 lands the adapter and verifies the SDK surface answers `tasks/get` for an unknown task with a SDK-defined error response.

**Branch:** `feat/plan8-task-adapter`

### Task 3.1: Add SDK imports and the `RegisterTaskToolSpec` / `JigTaskHandler` types

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Extend the SDK import to include task types**

The current import is:

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
  type RegisteredResourceTemplate,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
```

Replace with:

```typescript
import {
  InMemoryTaskStore,
  McpServer,
  ResourceTemplate,
  fromJsonSchema,
  type CallToolResult,
  type CreateTaskResult,
  type CreateTaskServerContext,
  type GetPromptResult,
  type GetTaskResult,
  type JsonSchemaType,
  type ReadResourceResult,
  type ReadResourceTemplateCallback,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredResourceTemplate,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type TaskServerContext,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
```

- [ ] **Step 2: Add `RegisterTaskToolSpec` and `JigTaskHandler` interfaces**

After `export type RegisteredPromptHandle = RegisteredPrompt;`, add:

```typescript
/**
 * Spec for registering one task tool. Mirrors RegisterToolSpec (description,
 * inputSchema, title, annotations) but adds `taskSupport` — the value lifted
 * from the YAML's `execution.taskSupport`. The adapter forwards this
 * verbatim into the SDK's TaskToolExecution.
 */
export interface RegisterTaskToolSpec {
  description: string;
  inputSchema?: JsonSchemaObject;
  title?: string;
  annotations?: ToolAnnotations;
  taskSupport: "required" | "optional";
}

/**
 * Lean three-callback handler shape jig passes into registerToolTask.
 * Mirrors the SDK's ToolTaskHandler<undefined> shape but exposes the
 * task store via plain getter helpers so callers stay off the SDK package.
 *
 *   createTask: receives (args, store) — args are the tools/call arguments
 *     normalized to Record<string, unknown>; store is the request-scoped
 *     RequestTaskStore. Returns a CreateTaskResult ({ task }).
 *   getTask: receives (taskId, store). Returns a GetTaskResult.
 *   getTaskResult: receives (taskId, store). Returns a CallToolResult.
 */
export interface JigTaskHandler {
  createTask(
    args: Record<string, unknown>,
    store: import("@modelcontextprotocol/server").RequestTaskStore,
  ): Promise<CreateTaskResult>;
  getTask(
    taskId: string,
    store: import("@modelcontextprotocol/server").RequestTaskStore,
  ): Promise<GetTaskResult>;
  getTaskResult(
    taskId: string,
    store: import("@modelcontextprotocol/server").RequestTaskStore,
  ): Promise<CallToolResult>;
}
```

> **Note on the `import("@modelcontextprotocol/server")` form:** This is the one place jig's `JigTaskHandler` interface needs the SDK's `RequestTaskStore` type. We use the inline-import form rather than adding `RequestTaskStore` to the file's main import statement so consumers (`tasks.ts`, `handlers/workflow.ts`) re-export only via `JigTaskHandler` and never touch the SDK package directly. This keeps the SDK quarantine intact.

### Task 3.2: Add `registerToolTask` to the `JigServerHandle` interface

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Add the method to the interface**

Inside `export interface JigServerHandle {`, add after `wireCompletions`:

```typescript
  /**
   * Register a task-based tool via the SDK's experimental.tasks
   * surface. The adapter bridges inputSchema via fromJsonSchema and
   * wraps the three callbacks (createTask, getTask, getTaskResult) so
   * the caller stays off the SDK package. Returns the SDK's
   * RegisteredTool handle.
   *
   * MUST be called before server.connect().
   */
  registerToolTask(
    name: string,
    spec: RegisterTaskToolSpec,
    handler: JigTaskHandler,
  ): RegisteredTool;
```

### Task 3.3: Wire `InMemoryTaskStore` into `createServer` and implement `registerToolTask`

**Files:**
- Modify: `src/runtime/server.ts`

- [ ] **Step 1: Pass `taskStore` in capabilities**

Find the `new McpServer(...)` call inside `createServer`. Replace the `capabilities:` block:

```typescript
      capabilities: {
        // Accurate up front: a later plan adds YAML hot-reload, which
        // will call sendToolListChanged(). Pre-declaring the capability
        // also means `initialize` advertises it even before Phase 4
        // registers the first tool.
        tools: { listChanged: true },
      },
```

with:

```typescript
      capabilities: {
        // Accurate up front: a later plan adds YAML hot-reload, which
        // will call sendToolListChanged(). Pre-declaring the capability
        // also means `initialize` advertises it even before Phase 4
        // registers the first tool.
        tools: { listChanged: true },
        // Plan 8: always advertise tasks capability with an in-memory
        // store. Tools without execution.taskSupport never reach the
        // tasks code path; advertising the capability up front lets
        // task-aware clients negotiate even when no task tool is
        // declared (the SDK answers tasks/get for unknown IDs with a
        // standard error response).
        tasks: {
          taskStore: new InMemoryTaskStore(),
        },
      },
```

- [ ] **Step 2: Implement `registerToolTask` in the returned object**

Inside the object returned by `createServer`, add after `wireCompletions`:

```typescript
    registerToolTask(name, spec, handler) {
      const inputSchema: StandardSchemaWithJSON | undefined =
        spec.inputSchema !== undefined ? fromJsonSchema(spec.inputSchema) : undefined;

      // Bridge the three jig callbacks into the SDK's ToolTaskHandler
      // shape. The SDK invokes createTask as (args, ctx) where ctx
      // exposes ctx.task.store: RequestTaskStore. getTask and
      // getTaskResult receive a TaskServerContext (ctx.task.id +
      // ctx.task.store). We translate to jig's lean signatures.
      const taskHandler = {
        createTask: async (
          args: Record<string, unknown>,
          ctx: CreateTaskServerContext,
        ) => handler.createTask(args, ctx.task.store),
        getTask: async (
          _args: Record<string, unknown>,
          ctx: TaskServerContext,
        ) => handler.getTask(ctx.task.id, ctx.task.store),
        getTaskResult: async (
          _args: Record<string, unknown>,
          ctx: TaskServerContext,
        ) => handler.getTaskResult(ctx.task.id, ctx.task.store),
      };

      // Cast through `unknown` at the boundary — SDK's generic inference
      // wants a concrete StandardSchemaWithJSON or undefined. Same
      // pattern as registerTool's split-cast for ToolCallback.
      type RegisterToolTaskFn = typeof server.experimental.tasks.registerToolTask;

      if (inputSchema !== undefined) {
        const cb: unknown = taskHandler;
        return server.experimental.tasks.registerToolTask(
          name,
          {
            description: render(spec.description, { probe }),
            inputSchema,
            execution: { taskSupport: spec.taskSupport },
            ...(spec.title !== undefined && { title: spec.title }),
            ...(spec.annotations !== undefined && { annotations: spec.annotations }),
          },
          cb as Parameters<RegisterToolTaskFn>[2],
        );
      }
      // No-schema branch (no inputSchema = no args).
      const cb: unknown = taskHandler;
      return server.experimental.tasks.registerToolTask(
        name,
        {
          description: render(spec.description, { probe }),
          execution: { taskSupport: spec.taskSupport },
          ...(spec.title !== undefined && { title: spec.title }),
          ...(spec.annotations !== undefined && { annotations: spec.annotations }),
        },
        cb as Parameters<RegisterToolTaskFn>[2],
      );
    },
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — no unused imports, no type errors. If `RegisterToolTaskFn` doesn't infer (the SDK's overload signatures may make `Parameters<...>[2]` fall through to the schema-bearing overload), simplify to `cb as Parameters<RegisterToolTaskFn>[2]` and verify the types resolve in the no-schema branch by passing through `as never` if needed. The runtime shape is correct on both sides.

### Task 3.4: Write a sanity test that the adapter exists and is callable

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append a sanity test**

```typescript
test("server boots with tasks capability advertised even when no task tool is declared", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-cap-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-cap, version: "0.0.1" }
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
      ],
    );
    const initResp = resp.find((r) => r.id === 1);
    assert.ok(initResp, "initialize response present");
    const result = initResp!.result as {
      capabilities: { tasks?: object };
    };
    assert.ok(result.capabilities.tasks, "tasks capability advertised");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run**

Run: `npm test -- --test-name-pattern="tasks capability advertised"`
Expected: PASS.

### Task 3.5: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): registerToolTask adapter + InMemoryTaskStore wiring

Phase 4 of Plan 8. Lands the SDK adapter for task-based tools.

Changes:
  - server.ts: capabilities.tasks now carries an InMemoryTaskStore
    instance, advertised at initialize time even when no task tool
    is declared (the SDK answers tasks/get for unknown IDs with a
    standard error)
  - server.ts: JigServerHandle.registerToolTask(name, spec,
    handler) bridges inputSchema via fromJsonSchema and wraps three
    jig callbacks (createTask, getTask, getTaskResult) into the
    SDK's ToolTaskHandler shape, then forwards through
    server.experimental.tasks.registerToolTask
  - server.ts: JigTaskHandler interface re-exposes the three
    callbacks with lean signatures (args/taskId + store) so
    consumers stay off the SDK package

No tools register through this path yet — Phase 6 partitions tools
by execution.taskSupport. The interpreter that drives the three
callbacks lands in Phase 5.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/server.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 5: `workflow:` handler + state-machine interpreter

**Intent:** After this phase, `Handler` union includes `WorkflowHandler` (`{ workflow: { ref: string, ttl_ms?: number } }`); `validateHandler` accepts and parses it; the existing `invoke()` in `handlers/index.ts` rejects it with a clear "task-only handler" error (workflow handlers MUST go through `registerToolTask`'s lifecycle, never through plain `tools/call`); `interpretWorkflow` in `tasks.ts` walks a state machine, runs actions sequentially through the existing `invoke()`, evaluates JSONLogic transition guards, and pushes status updates / a terminal result to a passed-in `RequestTaskStore`. Boot integration lands in Phase 5.

**Branch:** `feat/plan8-workflow-handler`

### Task 4.1: Add `WorkflowHandler` to the `Handler` union

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add the type after `GraphqlHandler`**

Search for `export interface GraphqlHandler {` and locate the closing brace. Insert after the closing `}`:

```typescript
/**
 * A workflow handler routes a tool call into a named state-machine
 * workflow declared in the top-level tasks: block. It is task-only —
 * the tool MUST also declare execution.taskSupport (Phase 6 enforces
 * the cross-ref). The plain invoke() path in handlers/index.ts rejects
 * workflow handlers with a clear error so accidental misuse fails loud.
 *
 * ttl_ms is the per-task lifetime hint passed to TaskStore.createTask.
 * Default: 300_000 (5 minutes), matching the SDK example.
 */
export interface WorkflowHandler {
  workflow: {
    ref: string;
    ttl_ms?: number;
  };
}
```

- [ ] **Step 2: Extend the `Handler` union**

Find:

```typescript
export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler
  | HttpHandler
  | GraphqlHandler;
```

Replace with:

```typescript
export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler
  | HttpHandler
  | GraphqlHandler
  | WorkflowHandler;
```

- [ ] **Step 3: Wire validateWorkflow into validateHandler**

Find `function validateHandler(v: unknown, toolName: string): Handler {`. Locate the chain of `if (h["..."]) ...` checks. After the last existing branch (`graphql`) and before the final `throw new Error(...)`, add:

```typescript
  if (h["workflow"] && typeof h["workflow"] === "object") {
    return validateWorkflowHandler(h["workflow"], toolName);
  }
```

- [ ] **Step 4: Add `validateWorkflowHandler` helper**

After `validateGraphql` and before the closing of the file (above any `export` at the bottom — keep it near the other handler validators), add:

```typescript
function validateWorkflowHandler(v: unknown, toolName: string): WorkflowHandler {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].handler.workflow must be a mapping`);
  }
  const w = v as Record<string, unknown>;

  const known = new Set(["ref", "ttl_ms"]);
  for (const key of Object.keys(w)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow: unknown key "${key}"`,
      );
    }
  }

  if (typeof w["ref"] !== "string" || w["ref"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.workflow.ref is required and must be a non-empty string`,
    );
  }
  const out: WorkflowHandler = { workflow: { ref: w["ref"] } };
  if (w["ttl_ms"] !== undefined) {
    if (typeof w["ttl_ms"] !== "number" || !Number.isFinite(w["ttl_ms"]) || w["ttl_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow.ttl_ms must be a positive number`,
      );
    }
    out.workflow.ttl_ms = w["ttl_ms"];
  }
  return out;
}
```

- [ ] **Step 5: Update the error message in `validateHandler` to mention workflow**

Find the final `throw new Error(...)` in `validateHandler` and replace with:

```typescript
  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (inline, exec, dispatch, compute, http, graphql, workflow)`,
  );
```

- [ ] **Step 6: Run typecheck**

Run: `npm run check`
Expected: FAIL — `handlers/index.ts` `invoke()`'s exhaustiveness check (`const _never: never = handler;`) now sees `WorkflowHandler` as a missing branch. This is the test signal — the next task adds the rejection branch.

### Task 4.2: Reject `workflow:` in `handlers/index.ts` `invoke()`

**Files:**
- Modify: `src/runtime/handlers/index.ts`

- [ ] **Step 1: Add the rejection branch before the exhaustiveness check**

Find:

```typescript
  if ("graphql" in handler) return invokeGraphql(handler, args, ctx);
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
```

Replace with:

```typescript
  if ("graphql" in handler) return invokeGraphql(handler, args, ctx);
  if ("workflow" in handler) {
    // Workflow handlers are task-only — they MUST be registered via
    // registerToolTask and driven by interpretWorkflow inside the
    // task's createTask callback. Reaching invoke() with a workflow
    // handler means the tool was registered via plain registerTool,
    // which is a Phase-5 boot-integration bug.
    throw new Error(
      `invoke: workflow handler "${handler.workflow.ref}" cannot be invoked through tools/call directly — it must be reached through the task lifecycle (registerToolTask). Tool registration is wired at boot in src/runtime/index.ts; check that this tool's execution.taskSupport is set.`,
    );
  }
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS — the exhaustiveness check is satisfied because the workflow branch consumes the variant before `_never` is assigned.

### Task 4.3: Write failing tests for the interpreter

**Files:**
- Modify: `tests/tasks.test.ts`

- [ ] **Step 1: Append interpreter unit tests**

```typescript
import {
  validateTasks,
  interpretWorkflow,
  type WorkflowRunHooks,
} from "../src/runtime/tasks.ts";
import { invoke as invokeHandler } from "../src/runtime/handlers/index.ts";

// Stub task store collecting status updates and the terminal result.
function makeTrackingStore() {
  const statusUpdates: Array<{ status: string; statusMessage?: string }> = [];
  const results: Array<{ status: string; result: unknown }> = [];
  return {
    statusUpdates,
    results,
    store: {
      async createTask() {
        return { taskId: "stub-task", status: "working", createdAt: 0, ttl: 60_000 };
      },
      async getTask(taskId: string) {
        return { taskId, status: statusUpdates.at(-1)?.status ?? "working", createdAt: 0, ttl: 60_000 };
      },
      async getTaskResult() {
        return results.at(-1)?.result;
      },
      async storeTaskResult(_taskId: string, status: "completed" | "failed", result: unknown) {
        results.push({ status, result });
      },
      async updateTaskStatus(_taskId: string, status: string, statusMessage?: string) {
        statusUpdates.push({ status, statusMessage });
      },
    },
  };
}

test("interpreter runs a single-state workflow that goes straight to a completed terminal", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "done",
        states: {
          done: { mcpStatus: "completed", result: { text: "instant" } },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  assert.equal(tracker.results.length, 1);
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "instant");
});

test("interpreter chains states: working -> completed via unguarded transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "step1",
        states: {
          step1: {
            mcpStatus: "working",
            statusMessage: "step 1",
            actions: [{ inline: { text: "ran step 1" } }],
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "all done" } },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  // Expect at least one status update for the working state.
  assert.ok(
    tracker.statusUpdates.some((u) => u.status === "working" && u.statusMessage === "step 1"),
    "working status pushed",
  );
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "all done");
});

test("interpreter picks the first matching when: transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "decide",
        states: {
          decide: {
            mcpStatus: "working",
            actions: [{ inline: { text: '{"valid": true}' } }],
            on: [
              { when: { "==": [{ var: "result.valid" }, false] }, target: "rejected" },
              { when: { "==": [{ var: "result.valid" }, true] }, target: "approved" },
            ],
          },
          approved: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "approved");
});

test("interpreter Mustache-renders the terminal result with input/result/probe", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "compute",
        states: {
          compute: {
            mcpStatus: "working",
            actions: [{ inline: { text: '{"answer": 42}' } }],
            on: [{ target: "done" }],
          },
          done: {
            mcpStatus: "completed",
            result: { text: "input={{input.q}} answer={{result.answer}} probe={{probe.host}}" },
          },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: { q: "life" },
    ctx: { connections: {}, probe: { host: "localhost" } },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "input=life answer=42 probe=localhost");
});

test("interpreter fails the task when an action returns isError: true", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "boom",
        states: {
          boom: {
            mcpStatus: "working",
            actions: [{ exec: "false" }], // exits non-zero, becomes isError
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "should not reach" } },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }>; isError?: boolean };
  assert.ok(r.isError);
  assert.match(r.content[0]!.text, /action.*failed/i);
});

test("interpreter fails the task when no transition matches and state has no result", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "stuck",
        states: {
          stuck: {
            mcpStatus: "working",
            actions: [{ inline: { text: "x" } }],
            on: [{ when: { "==": [1, 0] }, target: "never" }],
          },
          never: { mcpStatus: "completed", result: { text: "unreachable" } },
        },
      },
    },
    () => ({ inline: { text: "" } }),
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.match(r.content[0]!.text, /no transition matched/i);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="interpreter"`
Expected: all FAIL — `interpretWorkflow` doesn't exist yet (compile error from the import).

### Task 4.4: Implement `interpretWorkflow` in `tasks.ts`

**Files:**
- Modify: `src/runtime/tasks.ts`

- [ ] **Step 1: Add imports at the top of `tasks.ts`**

Replace the import block at the top of `src/runtime/tasks.ts`:

```typescript
import type {
  Handler,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";
```

with:

```typescript
import type {
  Handler,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
import type { CallToolResult } from "./server.ts";
import type { InvokeContext, ToolCallResult } from "./handlers/types.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";
import { evalJsonLogic } from "./util/jsonlogic.ts";
import { render } from "./util/template.ts";
```

> **Note on the `CallToolResult` import:** `tasks.ts` imports `CallToolResult` from `./server.ts` (the SDK quarantine point), not from `@modelcontextprotocol/server` directly. `server.ts` already re-exports the SDK's `CallToolResult` shape via `ToolHandler`'s return type. Verify the export — if `CallToolResult` is not yet re-exported, add `export type { CallToolResult } from "@modelcontextprotocol/server";` to `server.ts` first (this is a one-line addition; document in the commit).

- [ ] **Step 2: Append `interpretWorkflow` to `tasks.ts`**

```typescript
/**
 * Hooks the interpreter calls into. The minimal surface keeps tasks.ts
 * decoupled from both handlers/index.ts and server.ts at type level —
 * they pass concrete implementations at boot time.
 */
export interface WorkflowRunHooks {
  invoke: (
    handler: Handler,
    args: Record<string, unknown>,
    ctx: InvokeContext,
  ) => Promise<ToolCallResult>;
}

/**
 * Minimal task-store surface the interpreter needs. Mirrors a subset of
 * the SDK's RequestTaskStore but exposed as a plain interface so unit
 * tests can substitute a tracking double without touching the SDK.
 */
export interface InterpreterTaskStore {
  storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: CallToolResult,
  ): Promise<void>;
  updateTaskStatus(
    taskId: string,
    status: "working" | "completed" | "failed",
    statusMessage?: string,
  ): Promise<void>;
}

export interface InterpretWorkflowOptions {
  workflow: WorkflowSpec;
  args: Record<string, unknown>;
  ctx: InvokeContext;
  store: InterpreterTaskStore;
  taskId: string;
  invoke: WorkflowRunHooks["invoke"];
}

/**
 * Drive a state-machine workflow to a terminal result.
 *
 * Algorithm:
 *   1. start = workflow.initial
 *   2. for each state:
 *      a. updateTaskStatus(taskId, mcpStatus, statusMessage)
 *      b. if state has actions, run each in declared order via invoke();
 *         the result of the LAST action becomes workflowCtx.result
 *         (parsed as JSON if the text content parses, else raw text)
 *      c. if any action returns isError: true OR throws, transition
 *         immediately to a synthesized failed terminal with the error
 *         text as result, then return
 *      d. if state is terminal, render result.text via Mustache against
 *         { input, result, probe }, storeTaskResult(taskId,
 *         mcpStatusToStoreStatus(mcpStatus), { content: [{ type: "text",
 *         text: rendered }] }), then return
 *      e. evaluate state.on transitions in declaration order; pick the
 *         first whose `when` evaluates truthy (or has no `when`); set
 *         current = transition.target; loop
 *      f. if no transition matches, storeTaskResult with failed status
 *         and an "interpreter: no transition matched" error message;
 *         return
 *
 * Status update failures are swallowed (the workflow advances even if
 * the SDK can't push to the client). The terminal storeTaskResult IS
 * awaited — that's the contract for tasks/result.
 */
export async function interpretWorkflow(
  opts: InterpretWorkflowOptions,
): Promise<void> {
  const { workflow, args, ctx, store, taskId, invoke } = opts;
  // Workflow context: input is the original tools/call args; result is the
  // most-recent action's parsed output (or raw text if not JSON); probe is
  // the boot-resolved probe map.
  const workflowCtx: { input: Record<string, unknown>; result: unknown; probe: Record<string, unknown> } = {
    input: args,
    result: undefined,
    probe: ctx.probe,
  };

  let current = workflow.initial;
  // Loop guard. Workflow loops are rare but possible if an author writes
  // a transition that references a prior state with always-true guards.
  // Plan 8 simply caps the step count at 1024 to bound runaway interpreters
  // — a future plan can introduce explicit cycle detection if real configs
  // need it.
  const MAX_STEPS = 1024;
  let steps = 0;

  while (steps++ < MAX_STEPS) {
    const state = workflow.states[current];
    if (!state) {
      // Should be unreachable — validateTasks rejects undeclared targets.
      // Defensive guard so a future bug surfaces as a failed task instead
      // of an unhandled rejection.
      await safeFail(
        store,
        taskId,
        `interpreter: state "${current}" not declared (this is a jig bug — should have been caught at parse time)`,
      );
      return;
    }

    // Push status update; do not await failure-blocking — the SDK may
    // not have a transport to write to in a unit test.
    void store
      .updateTaskStatus(taskId, state.mcpStatus, state.statusMessage)
      .catch(() => {
        // Swallow — see Plan 8 design note: status push is best-effort.
      });

    // Run actions in sequence; capture each result; the last one wins.
    if (state.actions !== undefined) {
      let actionResult: ToolCallResult | undefined;
      for (let i = 0; i < state.actions.length; i++) {
        try {
          actionResult = await invoke(state.actions[i]!, args, ctx);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await safeFail(
            store,
            taskId,
            `action ${i} (state "${current}") threw: ${message}`,
          );
          return;
        }
        if (actionResult.isError) {
          const text = actionResult.content[0]?.text ?? "<no error text>";
          await safeFail(
            store,
            taskId,
            `action ${i} (state "${current}") failed: ${text}`,
          );
          return;
        }
      }
      if (actionResult !== undefined) {
        workflowCtx.result = parseActionResult(actionResult);
      }
    }

    // Terminal state? Render and store.
    if (state.result !== undefined) {
      const rendered = render(state.result.text, workflowCtx);
      const storeStatus: "completed" | "failed" =
        state.mcpStatus === "failed" ? "failed" : "completed";
      const finalResult: CallToolResult = {
        content: [{ type: "text", text: rendered }],
        ...(storeStatus === "failed" && { isError: true }),
      };
      await store.storeTaskResult(taskId, storeStatus, finalResult);
      return;
    }

    // Pick the first matching transition.
    if (state.on === undefined || state.on.length === 0) {
      // Should be unreachable — validateTasks rejects non-terminal states
      // without on:. Defensive guard.
      await safeFail(
        store,
        taskId,
        `interpreter: state "${current}" is non-terminal but has no on: transitions`,
      );
      return;
    }

    const next = pickTransition(state.on, workflowCtx);
    if (next === undefined) {
      await safeFail(
        store,
        taskId,
        `interpreter: no transition matched in state "${current}" — workflow stalled`,
      );
      return;
    }
    current = next.target;
  }

  await safeFail(
    store,
    taskId,
    `interpreter: max steps (${MAX_STEPS}) exceeded — likely a transition loop`,
  );
}

function pickTransition(
  transitions: TransitionSpec[],
  workflowCtx: unknown,
): TransitionSpec | undefined {
  for (const t of transitions) {
    if (t.when === undefined) return t;
    let matched: unknown;
    try {
      matched = evalJsonLogic(t.when as JsonLogicRule, workflowCtx);
    } catch {
      // Engine error treated as "this transition does not match" — try
      // the next one. The interpreter's overall fall-through to "no
      // transition matched" will fail the task if all of them error.
      continue;
    }
    if (matched) return t;
  }
  return undefined;
}

/**
 * Parse an action's text content as JSON for use in workflow.result.
 * Falls back to the raw text if parsing fails. Empty content → undefined.
 */
function parseActionResult(result: ToolCallResult): unknown {
  const text = result.content[0]?.text;
  if (text === undefined || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function safeFail(
  store: InterpreterTaskStore,
  taskId: string,
  message: string,
): Promise<void> {
  try {
    await store.storeTaskResult(taskId, "failed", {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  } catch {
    // Nothing left to do; the store is the only output channel.
  }
}
```

- [ ] **Step 3: Verify `evalJsonLogic` is exported from `util/jsonlogic.ts`**

Run: `grep -n "evalJsonLogic\|^export" /Users/clay/source/claylo/jig/src/runtime/util/jsonlogic.ts | head -20`

If `evalJsonLogic` is named differently in the existing module, swap the import and the call site to match. The existing module's export name is the one the interpreter must use; do NOT add a new wrapper.

- [ ] **Step 4: Verify `CallToolResult` is reachable from `server.ts`**

Run: `grep -n "CallToolResult" src/runtime/server.ts`

If `CallToolResult` is imported but not re-exported from `server.ts`, add this line near the other re-exports in `server.ts`:

```typescript
export type { CallToolResult } from "@modelcontextprotocol/server";
```

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Run the interpreter tests**

Run: `npm test -- --test-name-pattern="interpreter"`
Expected: all six interpreter tests PASS.

### Task 4.5: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): workflow handler + state-machine interpreter

Phase 5 of Plan 8.

Changes:
  - config.ts: Handler union gains WorkflowHandler ({ workflow:
    { ref, ttl_ms? } }); validateHandler accepts and parses it
  - handlers/index.ts: invoke() rejects workflow handlers with a
    clear "task-only handler" error pointing at boot-time
    registration (Phase 6 wiring); preserves exhaustiveness check
  - tasks.ts: interpretWorkflow drives a state machine to a
    terminal CallToolResult — runs actions sequentially via
    invoke(), evaluates JSONLogic transition guards in declaration
    order (first match wins), Mustache-renders the terminal
    result.text against { input, result, probe }, pushes
    updateTaskStatus on each state entry (best-effort), awaits
    storeTaskResult on terminal
  - tasks.ts: WorkflowRunHooks + InterpreterTaskStore + 
    InterpretWorkflowOptions exported so the boot wiring (Phase 6)
    and the unit tests can pass concrete implementations

Action errors (isError: true OR thrown) flow to a synthesized
failed terminal with the error text as the result. No transition
matching → failed terminal with diagnostic message. Hard cap at
1024 steps to bound runaway interpreters.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/config.ts \
  src/runtime/tasks.ts \
  src/runtime/handlers/index.ts \
  src/runtime/server.ts \
  tests/tasks.test.ts
```

Clay: `gtxt && git pm`

---

## Phase 6: Boot integration (simple case) — partition tools by `execution.taskSupport`

**Intent:** After this phase, `index.ts` partitions the tools array at boot: tools with `execution.taskSupport` AND outer handler `workflow:` route through `server.registerToolTask` with the workflow interpreter as the `createTask` body; tools without `execution.taskSupport` keep the existing `server.registerTool` path. Cross-ref check (strict in this phase): every `workflow.ref` resolves to a declared task in `config.tasks`; a task tool with a non-workflow outer handler is a parse-time error; a workflow handler on a non-task tool is a parse-time error.

**Acceptance:** After this phase, `examples/tasks.yaml` (the dedicated workflow tool) boots and its lifecycle works end-to-end. `examples/tasks-one-tool.yaml` (the dispatcher with workflow case) STILL fails to parse — its `dispatch:` outer handler trips the strict cross-ref check. Phase 7 relaxes that.

**Branch:** `feat/plan8-boot-simple`

### Task 5.1: Write failing cross-ref tests

**Files:**
- Modify: `tests/tasks.test.ts`

- [ ] **Step 1: Append cross-ref tests**

```typescript
test("config rejects a workflow handler on a tool without execution.taskSupport", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    handler:
      workflow: { ref: w }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*workflow handler.*requires execution\.taskSupport/i,
  );
});

test("config rejects a task tool with a non-workflow handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
    handler:
      inline: { text: x }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*task tool.*workflow handler/i,
  );
});

test("config rejects a workflow.ref that doesn't resolve", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
    handler:
      workflow: { ref: "no_such_workflow" }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\]\.handler\.workflow\.ref "no_such_workflow" not found in tasks:/,
  );
});

test("config accepts a properly wired task tool", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: ok
    description: x
    execution:
      taskSupport: required
    handler:
      workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "required");
  assert.ok("workflow" in cfg.tools[0]!.handler);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern="cross-ref|properly wired|workflow handler on a tool|task tool with a non-workflow|workflow\.ref that doesn't resolve"`
Expected: all four FAIL — the cross-ref check doesn't exist yet.

### Task 5.2: Add the cross-ref check to `parseConfig`

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add `crossRefTasks` helper**

After `validateTasks` is imported and before `function parseConfig` is defined, add:

```typescript
/**
 * After all blocks are validated, enforce the cross-block invariants:
 *   - every tool with execution.taskSupport must have a workflow: handler
 *   - every tool with a workflow: handler must have execution.taskSupport
 *   - every workflow.ref must resolve to a declared task workflow
 */
function crossRefTasks(tools: ToolDefinition[], tasks: TasksConfig | undefined): void {
  for (const tool of tools) {
    const isTaskTool = tool.execution !== undefined;
    const isWorkflowHandler = "workflow" in tool.handler;

    if (isWorkflowHandler && !isTaskTool) {
      throw new Error(
        `config: tools[${tool.name}]: workflow handler requires execution.taskSupport (declare execution: { taskSupport: required } or change the handler)`,
      );
    }
    if (isTaskTool && !isWorkflowHandler) {
      throw new Error(
        `config: tools[${tool.name}]: task tool (execution.taskSupport set) requires a workflow handler in v1 (handler: { workflow: { ref: <task_name> } })`,
      );
    }
    if (isWorkflowHandler) {
      const ref = (tool.handler as WorkflowHandler).workflow.ref;
      if (!tasks || !(ref in tasks)) {
        throw new Error(
          `config: tools[${tool.name}].handler.workflow.ref "${ref}" not found in tasks:`,
        );
      }
    }
  }
}
```

- [ ] **Step 2: Call `crossRefTasks` from `parseConfig`**

Find the end of `parseConfig` (right before `return result;`) and insert:

```typescript
  crossRefTasks(tools, tasks);
```

- [ ] **Step 3: Run the cross-ref tests**

Run: `npm test -- --test-name-pattern="cross-ref|properly wired|workflow handler on a tool|task tool with a non-workflow|workflow\.ref that doesn't resolve"`
Expected: all four PASS.

Run: `npm run check`
Expected: PASS.

### Task 5.3: Wire boot integration in `index.ts`

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Add imports**

Replace the existing imports block at the top of `src/runtime/index.ts`. Current:

```typescript
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { registerResources, startWatchers } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { createStdioTransport } from "./transports/stdio.ts";
import { configureAccess, isHostAllowed } from "./util/access.ts";
import { applyTransform } from "./util/transform.ts";
import { compileConnections } from "./connections.ts";
import { resolveProbes } from "./probes.ts";
import "./util/helpers.ts";
```

Replace with:

```typescript
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { registerResources, startWatchers } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { interpretWorkflow } from "./tasks.ts";
import { createStdioTransport } from "./transports/stdio.ts";
import { configureAccess, isHostAllowed } from "./util/access.ts";
import { applyTransform } from "./util/transform.ts";
import { compileConnections } from "./connections.ts";
import { resolveProbes } from "./probes.ts";
import "./util/helpers.ts";
```

- [ ] **Step 2: Replace the tool-registration loop with a partition**

Find the existing block:

```typescript
  // Each tool's handler gets routed through the central invoke(). That
  // is what lets a dispatch tool reach exec, inline, or nested dispatch
  // without index.ts knowing the handler types.
  for (const tool of config.tools) {
    const handler: ToolHandler = async (args: unknown) => {
      const normalized = normalizeArgs(args);
      const raw = await invoke(tool.handler, normalized, ctx);
      if (tool.transform === undefined) return raw;
      return applyTransform(raw, normalized, ctx.probe, tool.transform);
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

Replace with:

```typescript
  // Partition tools by execution.taskSupport. Plain tools route through
  // registerTool with the central invoke(). Task tools route through
  // registerToolTask, where createTask spawns interpretWorkflow on the
  // referenced state-machine workflow asynchronously and pushes status
  // updates / a terminal result to the request-scoped task store.
  for (const tool of config.tools) {
    if (tool.execution !== undefined) {
      registerTaskTool(tool);
    } else {
      registerPlainTool(tool);
    }
  }

  function registerPlainTool(tool: typeof config.tools[number]): void {
    const handler: ToolHandler = async (args: unknown) => {
      const normalized = normalizeArgs(args);
      const raw = await invoke(tool.handler, normalized, ctx);
      if (tool.transform === undefined) return raw;
      return applyTransform(raw, normalized, ctx.probe, tool.transform);
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

  function registerTaskTool(tool: typeof config.tools[number]): void {
    // Cross-ref check at parseConfig already guarantees the handler is
    // workflow: and the ref resolves; narrow with a runtime assertion
    // so the type system follows.
    if (!("workflow" in tool.handler)) {
      throw new Error(
        `boot: task tool "${tool.name}" reached registerTaskTool without a workflow handler (parseConfig cross-ref should have caught this)`,
      );
    }
    const workflowRef = tool.handler.workflow.ref;
    const ttl_ms = tool.handler.workflow.ttl_ms ?? 300_000;
    const workflow = config.tasks?.[workflowRef];
    if (!workflow) {
      throw new Error(
        `boot: workflow "${workflowRef}" not declared in tasks: (parseConfig cross-ref should have caught this)`,
      );
    }
    server.registerToolTask(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
        taskSupport: tool.execution!.taskSupport,
      },
      {
        async createTask(args, store) {
          const task = await store.createTask({ ttl: ttl_ms });
          // Fire-and-forget: interpretWorkflow walks the state machine,
          // pushes status updates, and stores the terminal result. Errors
          // inside the interpreter become failed task results — they
          // never bubble out of this createTask callback.
          void interpretWorkflow({
            workflow,
            args,
            ctx,
            store,
            taskId: task.taskId,
            invoke,
          });
          return { task };
        },
        async getTask(taskId, store) {
          const t = await store.getTask(taskId);
          if (!t) {
            throw new Error(`tasks/get: task "${taskId}" not found`);
          }
          // The SDK's GetTaskResult shape is the Task object itself.
          return t;
        },
        async getTaskResult(taskId, store) {
          const r = await store.getTaskResult(taskId);
          // The store stores a CallToolResult; return it verbatim.
          return r as Awaited<ReturnType<typeof store.getTaskResult>> as Parameters<typeof server.registerToolTask>[2]["getTaskResult"] extends never ? never :
            // The cast above is a type-system formality; runtime shape is correct.
            r;
        },
      },
    );
  }
```

> **Note on `getTaskResult`'s cast:** The SDK types `getTaskResult` as returning `CallToolResult`, but the store's `getTaskResult` returns the broader `Result$1` (anything the interpreter previously stored). Since `interpretWorkflow` only ever stores a `CallToolResult`-shaped object, the runtime shape always matches. If TypeScript still complains, simplify the body to:
>
> ```typescript
> async getTaskResult(taskId, store) {
>   return (await store.getTaskResult(taskId)) as Awaited<ReturnType<JigTaskHandler["getTaskResult"]>>;
> }
> ```
>
> Import `JigTaskHandler` from `./server.ts` if needed. Pre-flight: try the simpler form first.

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS — if it fails, simplify the `getTaskResult` cast as noted above.

### Task 5.4: Write failing integration tests for the task lifecycle

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append task lifecycle integration tests**

```typescript
test("tools/call on a task tool returns a CreateTaskResult, not a CallToolResult", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-create-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-create, version: "0.0.1" }
tasks:
  instant:
    initial: done
    states:
      done:
        mcpStatus: completed
        result:
          text: "instant complete"
tools:
  - name: do_thing
    description: "Instant task"
    execution:
      taskSupport: required
    handler:
      workflow: { ref: instant }
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: { experimental: { tasks: {} } },
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: {
          name: "do_thing",
          arguments: {},
          _meta: { task: { ttl: 60_000 } },
        } },
      ],
    );
    const callResp = resp.find((r) => r.id === 2);
    assert.ok(callResp, "tools/call response present");
    const result = callResp!.result as { task?: { taskId: string; status: string } };
    assert.ok(result.task, "tools/call returned a task object (CreateTaskResult shape)");
    assert.ok(result.task!.taskId, "task has a taskId");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan 8 task lifecycle: tools/call -> tasks/get -> tasks/result returns interpreter output", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-lifecycle-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-lifecycle, version: "0.0.1" }
tasks:
  echo_workflow:
    initial: compute
    states:
      compute:
        mcpStatus: working
        statusMessage: "computing"
        actions:
          - inline: { text: '{"squared": 16}' }
        on:
          - target: done
      done:
        mcpStatus: completed
        result:
          text: "input.n={{input.n}} squared={{result.squared}}"
tools:
  - name: square
    description: "Square a number via workflow"
    input:
      n: { type: integer, required: true }
    execution:
      taskSupport: required
    handler:
      workflow: { ref: echo_workflow }
`);
  try {
    // Drive the lifecycle in three RPC steps; the second and third
    // poll until the task is terminal.
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
      protocolVersion: "2025-11-25",
      capabilities: { experimental: { tasks: {} } },
      clientInfo: { name: "lifecycle", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // 2. tools/call → CreateTaskResult
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "square",
      arguments: { n: 4 },
      _meta: { task: { ttl: 60_000 } },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));
    const callResp = JSON.parse(stdoutLines.find((l) => l.includes('"id":2'))!);
    const taskId = callResp.result.task.taskId;
    assert.ok(taskId, "got taskId");

    // 3. Poll tasks/get until status is terminal
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while (status === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker));
      const getResp = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!);
      status = getResp.result.status;
      pollId++;
      if (status === "working") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "completed", "task reached completed status");

    // 4. tasks/result → final CallToolResult
    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker));
    const resultResp = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!);
    const finalResult = resultResp.result as {
      content: Array<{ type: string; text: string }>;
    };
    assert.equal(finalResult.content[0]!.text, "input.n=4 squared=16");

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify they fail before, then pass after Task 5.3 is complete**

Run: `npm test -- --test-name-pattern="task tool returns a CreateTaskResult|task lifecycle"`

Expected: both PASS. (If they fail at the `tasks/get` shape assertion, the SDK's `GetTaskResult` may have changed shape — pre-flight: `grep -n "GetTaskResultSchema\|GetTaskResult\b" node_modules/@modelcontextprotocol/server/dist/index-Bhfkexnj.d.mts | head -10`.)

### Task 5.5: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS.

- [ ] **Step 2: Write the commit message**

```
feat(runtime): boot integration (simple case) — workflow tools

Phase 6 of Plan 8 — simple-case boot integration. Strict
cross-ref check enforces: task tools must have a workflow:
outer handler; non-task tools cannot have a workflow: outer
handler. Phase 7 relaxes the strict check to allow
dispatch:-with-workflow-cases.

Changes:
  - config.ts: parseConfig runs a final crossRefTasks pass after
    all blocks validate. Strict rules: workflow handler requires
    execution.taskSupport; task tool requires a workflow handler
    (Phase 7 will allow dispatch); workflow.ref must resolve to
    a declared workflow in tasks:
  - index.ts: boot loop partitions config.tools by
    execution.taskSupport. Plain tools keep the existing
    registerTool + invoke() path. Task tools route through
    server.registerToolTask with a JigTaskHandler whose
    createTask resolves the named workflow, calls
    store.createTask({ ttl: ttl_ms ?? 300_000 }), and spawns
    interpretWorkflow async (errors during interpretation become
    failed task results, never bubble out of createTask). getTask
    delegates to store.getTask; getTaskResult delegates to
    store.getTaskResult

After this commit, examples/tasks.yaml boots end-to-end:
tools/call returns a CreateTaskResult, tasks/get polls live
mcpStatus + statusMessage, tasks/result returns the rendered
terminal CallToolResult. examples/tasks-one-tool.yaml STILL
fails to parse (its dispatch outer handler trips the strict
cross-ref); Phase 7 makes it boot.
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/config.ts \
  src/runtime/index.ts \
  tests/tasks.test.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 6 merges to main. `examples/tasks.yaml` boots; `examples/tasks-one-tool.yaml` does not yet.

---

## Phase 7: Dispatcher-task fusion — single-tool dispatchers with workflow cases

**Intent:** Preserve jig's single-tool spirit for state machines. After this phase, a task tool's outer handler can be either `workflow:` (the simple case from Phase 6) OR `dispatch:` (with at least one case routing to a `workflow:` handler). The fusion is what lets `examples/tasks-one-tool.yaml` boot — one MCP tool ("jobs") whose `dispatch` cases mix synchronous handlers (help, list — wrapped as one-step synthetic tasks at boot) with a workflow case (run — drives the interpreter). Without this phase, jig forces one-tool-per-workflow, breaking the streamlinear sub-1k-token contract.

**Acceptance:** After this phase, BOTH `examples/tasks.yaml` and `examples/tasks-one-tool.yaml` boot and their lifecycles work end-to-end via direct RPC. Smoke recipes and the e2e integration tests land in Phase 8.

**Branch:** `feat/plan8-dispatcher-fusion`

### Task 7.1: Extract `resolveDispatchCase` from `invokeDispatch`

**Files:**
- Modify: `src/runtime/handlers/dispatch.ts`

**Why:** The current `invokeDispatch` walks the dispatch tree to find the matching case AND invokes the case's handler in one go. The fusion needs the SAME case-matching logic but a different downstream action: when the matched case's handler is `workflow:`, kick off the interpreter; otherwise, invoke the handler synchronously and wrap as a one-step task. Extracting `resolveDispatchCase` lets both call sites share the matching logic without duplicating it.

- [ ] **Step 1: Read the existing `invokeDispatch` to identify the case-resolution code path**

Read: `src/runtime/handlers/dispatch.ts` and identify the section that:
1. Reads the `on:` field from the handler
2. Reads `args[on]` as the discriminator value
3. Looks up `cases[discriminator]`
4. Validates `requires:` (every required field present in args)
5. Evaluates `when:` (if present) against the dispatch context

- [ ] **Step 2: Extract that logic into a new exported function**

Add to `src/runtime/handlers/dispatch.ts` (alongside `invokeDispatch`):

```typescript
import type { DispatchCase, DispatchHandler } from "../config.ts";

/** Result of resolving a dispatch handler against runtime args. */
export type ResolveDispatchResult =
  | { matched: true; caseName: string; case: DispatchCase }
  | { matched: false; reason: string };

/**
 * Find the matching dispatch case for an incoming args object. Mirrors
 * the exact case-matching semantics of invokeDispatch but does not
 * invoke the matched case's handler — leaves that to the caller.
 *
 * Used by:
 *   - invokeDispatch (synchronous tool path) — invokes case.handler immediately
 *   - boot integration (dispatcher-task fusion, Phase 7) — branches on
 *     the matched case's handler type: workflow → interpreter,
 *     non-workflow → invoke + storeTaskResult as one-step synthetic task
 *
 * Both call sites need IDENTICAL matching semantics; this function is
 * the source of truth.
 */
export function resolveDispatchCase(
  handler: DispatchHandler,
  args: Record<string, unknown>,
  ctx: { probe: Record<string, unknown> },
): ResolveDispatchResult {
  const dispatch = handler.dispatch;
  const discriminatorValue = args[dispatch.on];
  if (typeof discriminatorValue !== "string") {
    return {
      matched: false,
      reason: `dispatch: discriminator field "${dispatch.on}" must be a string (got ${typeof discriminatorValue})`,
    };
  }
  const matched = dispatch.cases[discriminatorValue];
  if (!matched) {
    return {
      matched: false,
      reason: `dispatch: no case for ${dispatch.on}="${discriminatorValue}"`,
    };
  }
  if (matched.requires) {
    for (const req of matched.requires) {
      if (args[req] === undefined || args[req] === "") {
        return {
          matched: false,
          reason: `dispatch case "${discriminatorValue}" requires field "${req}"`,
        };
      }
    }
  }
  // when: evaluation is delegated to the existing invokeDispatch path; in
  // v1, when: on dispatch cases is rare and the simpler approach is to
  // let invokeDispatch handle when: in the synchronous path. The fusion
  // path does NOT support when: on cases — document in the landmines.
  return { matched: true, caseName: discriminatorValue, case: matched };
}
```

- [ ] **Step 3: Refactor `invokeDispatch` to use `resolveDispatchCase` for the matching step**

Replace the existing case-matching code inside `invokeDispatch` with a call to `resolveDispatchCase`. Preserve any `when:` evaluation that was outside the helper's scope. The behavior must not change — existing tests must stay green.

- [ ] **Step 4: Run all existing dispatch tests**

Run: `npm test -- --test-name-pattern="dispatch"`
Expected: all PASS (the refactor changes structure, not behavior).

Run: `npm run check`
Expected: PASS.

### Task 7.2: Write failing tests for the relaxed cross-ref check

**Files:**
- Modify: `tests/tasks.test.ts`

- [ ] **Step 1: Append cross-ref tests for the dispatcher-task case**

```typescript
test("config accepts a task tool with a dispatch handler whose case routes to a workflow", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: jobs
    description: x
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        help:
          handler:
            inline: { text: "help text" }
        run:
          handler:
            workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
  assert.ok("dispatch" in cfg.tools[0]!.handler);
});

test("config rejects a non-task tool with a dispatch handler containing a workflow case", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    input:
      action: { type: string, required: true }
    handler:
      dispatch:
        on: action
        help:
          handler:
            inline: { text: x }
        run:
          handler:
            workflow: { ref: w }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*workflow case.*requires execution\.taskSupport/i,
  );
});

test("config rejects a workflow.ref inside a dispatch case that doesn't resolve", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: required
    handler:
      dispatch:
        on: action
        run:
          handler:
            workflow: { ref: "no_such" }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\]\.handler\.dispatch\.cases\.run\.handler\.workflow\.ref "no_such" not found in tasks:/,
  );
});

test("config accepts a task tool with dispatch and NO workflow cases (all sync)", () => {
  // Edge case: author opts into taskSupport but has no workflow case.
  // Still valid — every case becomes a synthetic one-step task at boot.
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: jobs
    description: x
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        help:
          handler:
            inline: { text: "help" }
        list:
          handler:
            inline: { text: "[]" }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
});
```

- [ ] **Step 2: Run to verify the FIRST test fails (the strict Phase 6 cross-ref rejects it)**

Run: `npm test -- --test-name-pattern="dispatch handler whose case routes to a workflow|workflow case.*requires execution|workflow\.ref inside a dispatch case|dispatch and NO workflow cases"`
Expected: at least one FAIL — the strict cross-ref from Phase 6 rejects the dispatch-task case.

### Task 7.3: Relax `crossRefTasks` to allow dispatch-with-workflow-cases

**Files:**
- Modify: `src/runtime/config.ts`

- [ ] **Step 1: Add a helper that walks a handler tree to find every workflow ref**

Add near the existing `crossRefTasks` function:

```typescript
import type { DispatchHandler, WorkflowHandler } from "./config.ts";

/**
 * Walk a handler tree and yield every workflow.ref it contains.
 * Plan 8 supports two shapes:
 *   - outer handler is workflow: → one ref
 *   - outer handler is dispatch: → zero or more refs from cases[*].handler
 *     (recursively in case any future plan adds nested dispatch)
 *
 * Other handler types (inline/exec/compute/http/graphql) yield nothing.
 */
function* findWorkflowRefs(handler: Handler): Generator<{ ref: string; path: string }> {
  if ("workflow" in handler) {
    yield { ref: handler.workflow.ref, path: "handler.workflow" };
    return;
  }
  if ("dispatch" in handler) {
    for (const [caseName, caseSpec] of Object.entries(handler.dispatch.cases)) {
      for (const inner of findWorkflowRefs(caseSpec.handler)) {
        yield {
          ref: inner.ref,
          path: `handler.dispatch.cases.${caseName}.${inner.path}`,
        };
      }
    }
  }
  // inline/exec/compute/http/graphql: no workflow refs
}
```

- [ ] **Step 2: Replace the strict body of `crossRefTasks` with the relaxed version**

Replace the existing `crossRefTasks` function body:

```typescript
function crossRefTasks(tools: ToolDefinition[], tasks: TasksConfig | undefined): void {
  for (const tool of tools) {
    const isTaskTool = tool.execution !== undefined;
    const refs = [...findWorkflowRefs(tool.handler)];
    const hasAnyWorkflowRef = refs.length > 0;

    // Rule: a tool that contains ANY workflow ref (outer OR nested in
    // dispatch) requires execution.taskSupport.
    if (hasAnyWorkflowRef && !isTaskTool) {
      const refList = refs.map((r) => r.path).join(", ");
      throw new Error(
        `config: tools[${tool.name}]: workflow case present (${refList}) requires execution.taskSupport (declare execution: { taskSupport: required } or remove the workflow case)`,
      );
    }

    // Rule: every workflow.ref must resolve.
    for (const { ref, path } of refs) {
      if (!tasks || !(ref in tasks)) {
        throw new Error(
          `config: tools[${tool.name}].${path}.ref "${ref}" not found in tasks:`,
        );
      }
    }

    // Rule: a task tool's outer handler must be either workflow: or
    // dispatch:. Other handler types (inline/exec/compute/http/graphql
    // at the OUTER level) cannot drive the task lifecycle in v1.
    if (isTaskTool) {
      const outerOk = "workflow" in tool.handler || "dispatch" in tool.handler;
      if (!outerOk) {
        throw new Error(
          `config: tools[${tool.name}]: task tool (execution.taskSupport set) requires the outer handler to be workflow: or dispatch: (got ${Object.keys(tool.handler)[0]})`,
        );
      }
    }
  }
}
```

- [ ] **Step 3: Run the cross-ref tests**

Run: `npm test -- --test-name-pattern="dispatch handler whose case routes to a workflow|workflow case.*requires execution|workflow\.ref inside a dispatch case|dispatch and NO workflow cases"`
Expected: all four PASS.

Run: `npm test`
Expected: all OTHER tests still PASS (the relaxed cross-ref shouldn't break the strict tests from Phase 6 that test the now-still-valid restrictions).

> **Note:** the Phase-6 test "config rejects a task tool with a non-workflow handler" should now FAIL because dispatch IS allowed. Update its assertion: rename it to "config rejects a task tool with an inline/exec/compute outer handler (not workflow or dispatch)" and change the YAML to use `inline:` (not `dispatch:`). The error pattern from the relaxed cross-ref names what's missing: `task tool .* requires the outer handler to be workflow: or dispatch:`. If the test from Phase 6 was written too tightly, this is the time to loosen it.

### Task 7.4: Write failing integration test for the dispatcher-task fusion

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append integration tests**

```typescript
test("dispatcher-task fusion: tools/call routes a non-workflow case as a synthetic one-step task", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-help-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-fusion-help, version: "0.0.1" }
tasks:
  noop:
    initial: done
    states:
      done: { mcpStatus: completed, result: { text: ok } }
tools:
  - name: jobs
    description: "Dispatcher with one workflow case and one inline case"
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        help:
          handler:
            inline: { text: "help text here" }
        run:
          handler:
            workflow: { ref: noop }
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: { experimental: { tasks: {} } },
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: {
          name: "jobs",
          arguments: { action: "help" },
          _meta: { task: { ttl: 60_000 } },
        } },
      ],
    );
    const callResp = resp.find((r) => r.id === 2);
    assert.ok(callResp, "tools/call response present");
    const result = callResp!.result as { task?: { taskId: string; status: string } };
    assert.ok(result.task, "non-workflow case still returns a CreateTaskResult");
    assert.ok(result.task!.taskId);
    // The synthetic one-step task should be completed by the time we get
    // the response (createTask awaits the synchronous case before returning).
    // Can't assert status here without polling — that's the next test.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispatcher-task fusion: tools/call routes a workflow case through the interpreter", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-run-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-fusion-run, version: "0.0.1" }
tasks:
  echo_workflow:
    initial: compute
    states:
      compute:
        mcpStatus: working
        actions:
          - inline: { text: '{"squared": 16}' }
        on:
          - target: done
      done:
        mcpStatus: completed
        result:
          text: "input.n={{input.n}} squared={{result.squared}}"
tools:
  - name: math
    description: "Dispatcher whose run case kicks off a workflow"
    input:
      action: { type: string, required: true }
      n: { type: integer }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        run:
          requires: [n]
          handler:
            workflow: { ref: echo_workflow }
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
      protocolVersion: "2025-11-25",
      capabilities: { experimental: { tasks: {} } },
      clientInfo: { name: "fusion", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "math",
      arguments: { action: "run", n: 4 },
      _meta: { task: { ttl: 60_000 } },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));
    const callResp = JSON.parse(stdoutLines.find((l) => l.includes('"id":2'))!);
    const taskId = callResp.result.task.taskId as string;
    assert.ok(taskId);

    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while (status === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker));
      status = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!).result.status;
      pollId++;
      if (status === "working") await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(status, "completed");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker));
    const finalText = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!).result.content[0].text as string;
    assert.equal(finalText, "input.n=4 squared=16");

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispatcher-task fusion: dispatcher with NO workflow case — every action is a synthetic one-step task", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-allsync-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-fusion-allsync, version: "0.0.1" }
tools:
  - name: query
    description: "All-sync dispatcher under taskSupport (every case is one-step)"
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        ping:
          handler:
            inline: { text: "pong" }
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: { experimental: { tasks: {} } },
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: {
          name: "query",
          arguments: { action: "ping" },
          _meta: { task: { ttl: 60_000 } },
        } },
      ],
    );
    const callResp = resp.find((r) => r.id === 2);
    assert.ok(callResp, "tools/call response present");
    const result = callResp!.result as { task?: { taskId: string } };
    assert.ok(result.task, "all-sync dispatcher tool still returns CreateTaskResult");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify all three FAIL**

Run: `npm test -- --test-name-pattern="dispatcher-task fusion"`
Expected: all three FAIL — boot integration in Phase 6 only knows the `workflow:` outer-handler case; it errors on `dispatch:` outer-handler task tools at boot time (the `registerTaskTool` runtime assertion fires).

### Task 7.5: Update `registerTaskTool` to handle dispatch outer handlers

**Files:**
- Modify: `src/runtime/index.ts`

- [ ] **Step 1: Add the import for `resolveDispatchCase`**

```typescript
import { resolveDispatchCase } from "./handlers/dispatch.ts";
```

- [ ] **Step 2: Replace the body of `registerTaskTool`**

Find the existing `registerTaskTool` function from Phase 6 and replace its body:

```typescript
  function registerTaskTool(tool: typeof config.tools[number]): void {
    // Cross-ref check at parseConfig already guarantees the outer
    // handler is workflow: OR dispatch:; Phase 7 fusion routes both.
    const outerHandler = tool.handler;
    const isOuterWorkflow = "workflow" in outerHandler;
    const isOuterDispatch = "dispatch" in outerHandler;
    if (!isOuterWorkflow && !isOuterDispatch) {
      throw new Error(
        `boot: task tool "${tool.name}" reached registerTaskTool with neither workflow: nor dispatch: outer handler (parseConfig cross-ref should have caught this)`,
      );
    }

    server.registerToolTask(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
        taskSupport: tool.execution!.taskSupport,
      },
      {
        async createTask(args, store) {
          // Two outer-handler shapes:
          //   1. workflow: → kick off interpreter (Phase 6 simple case)
          //   2. dispatch: → resolve case, then either workflow OR sync
          if (isOuterWorkflow) {
            return startWorkflowTask(
              outerHandler.workflow.ref,
              outerHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
            );
          }

          // Dispatch outer handler — resolve the matched case.
          const resolved = resolveDispatchCase(outerHandler, args, { probe: ctx.probe });
          if (!resolved.matched) {
            // No case matched — return a synthetic immediately-failed task
            // so the SDK contract still holds (CreateTaskResult shape).
            const task = await store.createTask({ ttl: 60_000 });
            await store.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: resolved.reason }],
              isError: true,
            });
            return { task };
          }

          // Matched case has its own handler. Branch on workflow: vs sync.
          const caseHandler = resolved.case.handler;
          if ("workflow" in caseHandler) {
            return startWorkflowTask(
              caseHandler.workflow.ref,
              caseHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
            );
          }

          // Sync case — invoke and store immediately as a one-step
          // synthetic task. The SDK still gets a CreateTaskResult shape;
          // the task is already terminal by the time tasks/get is called.
          const task = await store.createTask({ ttl: 60_000 });
          try {
            const result = await invoke(caseHandler, args, ctx);
            const status: "completed" | "failed" = result.isError ? "failed" : "completed";
            await store.storeTaskResult(task.taskId, status, result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await store.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: `dispatch case "${resolved.caseName}" threw: ${message}` }],
              isError: true,
            });
          }
          return { task };
        },
        async getTask(taskId, store) {
          const t = await store.getTask(taskId);
          if (!t) throw new Error(`tasks/get: task "${taskId}" not found`);
          return t;
        },
        async getTaskResult(taskId, store) {
          return (await store.getTaskResult(taskId)) as Parameters<
            typeof server.registerToolTask
          >[2]["getTaskResult"] extends never ? never : Awaited<ReturnType<typeof store.getTaskResult>>;
        },
      },
    );

    // Helper closure: kicks off a workflow as a task. Shared between
    // the outer-workflow case and the dispatch-case-routes-to-workflow case.
    async function startWorkflowTask(
      workflowRef: string,
      ttl_ms: number,
      args: Record<string, unknown>,
      store: Parameters<JigTaskHandler["createTask"]>[1],
    ) {
      const workflow = config.tasks?.[workflowRef];
      if (!workflow) {
        throw new Error(
          `boot: workflow "${workflowRef}" not declared in tasks: (parseConfig cross-ref should have caught this)`,
        );
      }
      const task = await store.createTask({ ttl: ttl_ms });
      void interpretWorkflow({
        workflow,
        args,
        ctx,
        store,
        taskId: task.taskId,
        invoke,
      });
      return { task };
    }
  }
```

- [ ] **Step 3: Add the `JigTaskHandler` import if not already present**

```typescript
import type { JigTaskHandler } from "./server.ts";
```

- [ ] **Step 4: Run the fusion integration tests**

Run: `npm test -- --test-name-pattern="dispatcher-task fusion"`
Expected: all three PASS.

Run: `npm run check`
Expected: PASS. If `getTaskResult` cast doesn't infer, fall back to:
```typescript
async getTaskResult(taskId, store) {
  return (await store.getTaskResult(taskId)) as Awaited<ReturnType<JigTaskHandler["getTaskResult"]>>;
}
```

### Task 7.6: Verify both example YAMLs now boot

- [ ] **Step 1: Boot `examples/tasks.yaml`**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/tasks.yaml < /dev/null 2>&1 | head -3`
Expected: no parse error; runtime exits when stdin closes.

- [ ] **Step 2: Boot `examples/tasks-one-tool.yaml`**

Run: `node --experimental-transform-types src/runtime/index.ts --config examples/tasks-one-tool.yaml < /dev/null 2>&1 | head -3`
Expected: no parse error; runtime exits when stdin closes.

If either fails, diagnose before continuing — Phase 8's smoke recipes depend on both YAMLs booting cleanly.

### Task 7.7: Run the full gate suite and commit

- [ ] **Step 1: Run every gate**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`
Expected: all PASS (still 9 gates — smoke-task and smoke-task-one-tool land in Phase 8).

- [ ] **Step 2: Write the commit message**

```
feat(runtime): dispatcher-task fusion — single-tool workflows

Phase 7 of Plan 8. Preserves the streamlinear sub-1k-token
single-tool contract for state machines: a task tool's outer
handler can now be either workflow: (the Phase 6 simple case)
OR dispatch: (with at least one case routing to workflow:).

Changes:
  - handlers/dispatch.ts: extract resolveDispatchCase from
    invokeDispatch into a reusable helper. Both call sites
    (synchronous tools/call and the new task-tool createTask)
    share identical case-matching semantics
  - config.ts: relax crossRefTasks. New helper findWorkflowRefs
    walks the handler tree and yields every workflow.ref
    (recursively into dispatch cases). Rules:
      * any tool containing a workflow ref requires
        execution.taskSupport (whether outer or nested in
        dispatch)
      * every workflow.ref must resolve to a declared task
      * a task tool's outer handler must be workflow: or
        dispatch: (other types rejected)
  - index.ts: registerTaskTool's createTask now branches on
    outer-handler shape:
      * workflow: → existing startWorkflowTask helper
      * dispatch: → resolveDispatchCase to find matched case;
        if matched case is workflow:, startWorkflowTask;
        otherwise synchronously invoke + storeTaskResult as a
        one-step synthetic task

After this commit, examples/tasks-one-tool.yaml boots and the
single-tool dispatcher pattern works end-to-end. Both example
YAMLs are now lifecycle-functional via direct RPC; smoke
recipes and integration tests for both land in Phase 8.

Out of scope: when: clauses on dispatch cases under task tools
(documented as a landmine — the fusion path does not evaluate
when:; only outer-dispatch when: in the synchronous-tool path
is supported).
```

- [ ] **Step 3: Stage with specific paths**

```bash
git add \
  src/runtime/handlers/dispatch.ts \
  src/runtime/config.ts \
  src/runtime/index.ts \
  tests/tasks.test.ts \
  tests/integration.test.ts
```

Clay: `gtxt && git pm`

Expected: Phase 7 merges to main. Both example YAMLs boot.

---

## Phase 8: `smoke-task` + `smoke-task-one-tool` + e2e integration + handoff

**Intent:** Ship the acceptance proof for both Phase-1 artifacts. `just smoke-task` exercises initialize → tools/call (task) → tasks/get poll → tasks/result against `examples/tasks.yaml`. `just smoke-task-one-tool` does the same against `examples/tasks-one-tool.yaml`, exercising both a non-workflow case (help) and a workflow case (run). End-to-end integration tests point at both YAML files (no inline fixtures — the artifacts ARE the tests). Gate count grows from 9 to 11 with the two new smoke recipes. Handoff names Plan 9 (elicitation) as next.

**Branch:** `feat/plan8-complete`

### Task 8.1: Add the `smoke-task` and `smoke-task-one-tool` justfile recipes

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Append the recipe**

Append to the bottom of `justfile`:

```makefile
# Smoke-task: verify the Plan 8 example boots, tools/call on the task
# tool returns a CreateTaskResult with a taskId, tasks/get reaches
# completed status (polled), and tasks/result returns the rendered
# terminal text. Hermetic — all inline actions, no network.
smoke-task:
    #!/usr/bin/env bash
    set -euo pipefail
    # Step 1: send initialize + tools/call and capture the taskId.
    init_call='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"experimental":{"tasks":{}}},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"process_job","arguments":{"jobId":"j-42"},"_meta":{"task":{"ttl":60000}}}}'

    # We can't keep the process alive across discrete bash invocations
    # without a coprocess. Use a single piped session that sends all
    # messages including the tasks/get poll loop. Sleep briefly between
    # poll messages so the workflow's async interpretation completes.
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"experimental":{"tasks":{}}},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"process_job","arguments":{"jobId":"j-42"},"_meta":{"task":{"ttl":60000}}}}'

    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/tasks.yaml)
    if [ -z "$output" ]; then
      echo "smoke-task: no response from runtime" >&2
      exit 1
    fi

    # Pull the taskId from the tools/call response.
    task_id=$(echo "$output" | grep '"id":2' | head -1 | jq -r '.result.task.taskId')
    if [ -z "$task_id" ] || [ "$task_id" = "null" ]; then
      echo "smoke-task: no taskId in tools/call response" >&2
      echo "$output" | jq . >&2
      exit 1
    fi

    # Now do a follow-up session with tasks/get + tasks/result. Note: the
    # InMemoryTaskStore is per-process, so this requires the workflow to
    # complete before the runtime exits in the previous step. The async
    # interpretWorkflow runs to terminal during the same event-loop tick
    # for inline-only actions, so by the time the runtime closes stdin
    # and exits, storeTaskResult has been awaited. We re-launch and ask
    # tasks/result for the same ID — but a second InMemoryTaskStore loses
    # the result.
    #
    # Workaround: send tools/call + tasks/get + tasks/result as one piped
    # message stream. Add a small bash delay between writes so the worker
    # finishes before the get/result polls.
    pipeline='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"experimental":{"tasks":{}}},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"process_job","arguments":{"jobId":"j-42"},"_meta":{"task":{"ttl":60000}}}}'

    # Use a small node helper (inline JS) to drive the lifecycle properly.
    node --experimental-transform-types -e '
      import("node:child_process").then(async ({ spawn }) => {
        const child = spawn(process.execPath, [
          "--experimental-transform-types",
          "src/runtime/index.ts",
          "--config",
          "examples/tasks.yaml",
        ], { stdio: ["pipe", "pipe", "inherit"] });
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
        const wait = (pred, timeout = 5000) => new Promise((resolve, reject) => {
          const start = Date.now();
          const tick = setInterval(() => {
            const found = lines.find(pred);
            if (found) { clearInterval(tick); resolve(found); }
            else if (Date.now() - start > timeout) { clearInterval(tick); reject(new Error("timeout")); }
          }, 25);
        });
        send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: { experimental: { tasks: {} } }, clientInfo: { name: "smoke", version: "0" } } });
        await wait((l) => l.includes("\"id\":1"));
        send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "process_job", arguments: { jobId: "j-42" }, _meta: { task: { ttl: 60000 } } } });
        const callLine = await wait((l) => l.includes("\"id\":2"));
        const callResp = JSON.parse(callLine);
        const taskId = callResp.result.task.taskId;
        if (!taskId) { console.error("no taskId"); process.exit(1); }

        let status = "working";
        let pollId = 3;
        const startPoll = Date.now();
        while (status === "working" && Date.now() - startPoll < 5000) {
          send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
          const idMarker = "\"id\":" + pollId;
          const getLine = await wait((l) => l.includes(idMarker));
          status = JSON.parse(getLine).result.status;
          pollId++;
          if (status === "working") await new Promise((r) => setTimeout(r, 50));
        }
        if (status !== "completed") { console.error("task did not complete: " + status); process.exit(1); }

        send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
        const idMarker = "\"id\":" + pollId;
        const resLine = await wait((l) => l.includes(idMarker));
        const finalText = JSON.parse(resLine).result.content[0].text;
        if (!finalText.includes("j-42")) { console.error("result did not include input.jobId: " + finalText); process.exit(1); }
        if (!finalText.includes("#ops")) { console.error("result did not include notification channel: " + finalText); process.exit(1); }

        console.log(JSON.stringify({ taskId, status, finalText }, null, 2));
        child.stdin.end();
        await new Promise((r) => child.on("close", r));
      }).catch((e) => { console.error(e); process.exit(1); });
    '
    echo "smoke-task: OK"
```

> **Note on the recipe complexity:** smoke-task is the first jig smoke recipe that needs cross-message state (the taskId from `tools/call` must reach `tasks/get` and `tasks/result` in the same process — `InMemoryTaskStore` is per-process). Earlier recipes piped a fixed sequence of requests at once because each request was self-contained. Plan 8 needs polling, so we drop into a small inline node helper that drives the lifecycle. If this proves brittle, a follow-up plan can extract a reusable `scripts/smoke-driver.mjs` or migrate the smoke layer to a different harness — but Plan 8 keeps the lift small.

- [ ] **Step 2: Append the `smoke-task-one-tool` recipe**

Append to the bottom of `justfile`:

```makefile
# Smoke-task-one-tool: verify the dispatcher-task fusion. The dispatcher
# tool "jobs" handles two action shapes: a non-workflow case (help) that
# becomes a synthetic one-step task, and a workflow case (run) that
# drives the state-machine interpreter. Both must return a
# CreateTaskResult and reach a terminal status.
smoke-task-one-tool:
    #!/usr/bin/env bash
    set -euo pipefail
    node --experimental-transform-types -e '
      import("node:child_process").then(async ({ spawn }) => {
        const child = spawn(process.execPath, [
          "--experimental-transform-types",
          "src/runtime/index.ts",
          "--config",
          "examples/tasks-one-tool.yaml",
        ], { stdio: ["pipe", "pipe", "inherit"] });
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
        const wait = (pred, timeout = 5000) => new Promise((resolve, reject) => {
          const start = Date.now();
          const tick = setInterval(() => {
            const found = lines.find(pred);
            if (found) { clearInterval(tick); resolve(found); }
            else if (Date.now() - start > timeout) { clearInterval(tick); reject(new Error("timeout")); }
          }, 25);
        });

        // initialize
        send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: { experimental: { tasks: {} } }, clientInfo: { name: "smoke", version: "0" } } });
        await wait((l) => l.includes("\"id\":1"));

        // help action — non-workflow case becomes synthetic one-step task
        send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "jobs", arguments: { action: "help" }, _meta: { task: { ttl: 60000 } } } });
        const helpLine = await wait((l) => l.includes("\"id\":2"));
        const helpResp = JSON.parse(helpLine);
        const helpTaskId = helpResp.result.task.taskId;
        if (!helpTaskId) { console.error("help: no taskId"); process.exit(1); }

        // help should reach completed almost immediately (synthetic task)
        send({ jsonrpc: "2.0", id: 3, method: "tasks/get", params: { taskId: helpTaskId } });
        const helpGetLine = await wait((l) => l.includes("\"id\":3"));
        const helpStatus = JSON.parse(helpGetLine).result.status;
        if (helpStatus !== "completed") { console.error("help did not complete: " + helpStatus); process.exit(1); }

        send({ jsonrpc: "2.0", id: 4, method: "tasks/result", params: { taskId: helpTaskId } });
        const helpResLine = await wait((l) => l.includes("\"id\":4"));
        const helpText = JSON.parse(helpResLine).result.content[0].text;
        if (!helpText.includes("jobs management")) { console.error("help text wrong: " + helpText); process.exit(1); }

        // run action — workflow case kicks off the interpreter
        send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "jobs", arguments: { action: "run", jobId: "j-42" }, _meta: { task: { ttl: 60000 } } } });
        const runLine = await wait((l) => l.includes("\"id\":5"));
        const runResp = JSON.parse(runLine);
        const runTaskId = runResp.result.task.taskId;
        if (!runTaskId) { console.error("run: no taskId"); process.exit(1); }

        let runStatus = "working";
        let pollId = 6;
        const startPoll = Date.now();
        while (runStatus === "working" && Date.now() - startPoll < 5000) {
          send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId: runTaskId } });
          const idMarker = "\"id\":" + pollId;
          const runGetLine = await wait((l) => l.includes(idMarker));
          runStatus = JSON.parse(runGetLine).result.status;
          pollId++;
          if (runStatus === "working") await new Promise((r) => setTimeout(r, 50));
        }
        if (runStatus !== "completed") { console.error("run did not complete: " + runStatus); process.exit(1); }

        send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId: runTaskId } });
        const idMarker = "\"id\":" + pollId;
        const runResLine = await wait((l) => l.includes(idMarker));
        const runText = JSON.parse(runResLine).result.content[0].text;
        if (!runText.includes("j-42")) { console.error("run text missing jobId: " + runText); process.exit(1); }
        if (!runText.includes("#ops")) { console.error("run text missing channel: " + runText); process.exit(1); }

        console.log(JSON.stringify({ helpTaskId, helpStatus, runTaskId, runStatus, runText }, null, 2));
        child.stdin.end();
        await new Promise((r) => child.on("close", r));
      }).catch((e) => { console.error(e); process.exit(1); });
    '
    echo "smoke-task-one-tool: OK"
```

- [ ] **Step 3: Run both recipes**

Run: `just smoke-task && just smoke-task-one-tool`
Expected:
- `smoke-task` prints `{taskId, status: "completed", finalText: "...j-42...#ops..."}` and ends with `smoke-task: OK`
- `smoke-task-one-tool` prints `{helpTaskId, helpStatus: "completed", runTaskId, runStatus: "completed", runText: "...j-42...#ops..."}` and ends with `smoke-task-one-tool: OK`

### Task 8.2: Write Plan 8 end-to-end integration tests against BOTH example YAMLs

**Files:**
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the end-to-end test**

The test points at `examples/tasks.yaml` directly — the same artifact landed in Phase 1 and exercised by `just smoke-task`. No inline fixture YAML; the example YAML IS the test. If the YAML changes, this test surfaces the change.

```typescript
test("plan 8 round-trip against examples/tasks.yaml: validating → enriching → notifying → completed", { timeout: 15_000 }, async () => {
  const cfgPath = "examples/tasks.yaml";
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

  try {
    // 1. initialize
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { experimental: { tasks: {} } },
      clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // 2. tools/call → CreateTaskResult
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "process_job",
      arguments: { jobId: "j-99" },
      _meta: { task: { ttl: 60_000 } },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2'))!;
    const taskId = JSON.parse(callLine).result.task.taskId as string;
    assert.ok(taskId, "tools/call returned a taskId");

    // 3. Poll tasks/get until terminal
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while (status === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker));
      const getLine = stdoutLines.find((l) => l.includes(idMarker))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "completed", "task reached completed status");

    // 4. tasks/result → rendered terminal text
    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker));
    const resLine = stdoutLines.find((l) => l.includes(idMarker))!;
    const finalText = JSON.parse(resLine).result.content[0].text as string;
    // Assert against the structure of examples/tasks.yaml's completed
    // state — input.jobId and result.channel are the two interpolations.
    assert.match(finalText, /Job j-99 processed/);
    assert.match(finalText, /Notification posted to: #ops/);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    if (!child.killed) child.kill();
  }
});
```

- [ ] **Step 2: Append the second e2e test against `examples/tasks-one-tool.yaml`**

```typescript
test("plan 8 round-trip against examples/tasks-one-tool.yaml: dispatcher fusion (help → synthetic, run → workflow)", { timeout: 15_000 }, async () => {
  const cfgPath = "examples/tasks-one-tool.yaml";
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

  try {
    // 1. initialize
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { experimental: { tasks: {} } },
      clientInfo: { name: "e2e-onetool", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // 2. tools/list shows ONE tool ("jobs") — single-tool spirit preserved
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));
    const listLine = stdoutLines.find((l) => l.includes('"id":2'))!;
    const tools = JSON.parse(listLine).result.tools as Array<{ name: string }>;
    assert.equal(tools.length, 1, "single-tool dispatcher exposes exactly one MCP tool");
    assert.equal(tools[0]!.name, "jobs");

    // 3. action=help (synthetic one-step task)
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
      name: "jobs",
      arguments: { action: "help" },
      _meta: { task: { ttl: 60_000 } },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3'));
    const helpCallLine = stdoutLines.find((l) => l.includes('"id":3'))!;
    const helpTaskId = JSON.parse(helpCallLine).result.task.taskId as string;
    assert.ok(helpTaskId);

    send({ jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId: helpTaskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4'));
    const helpStatus = JSON.parse(stdoutLines.find((l) => l.includes('"id":4'))!).result.status;
    assert.equal(helpStatus, "completed", "help (synthetic) completes immediately");

    send({ jsonrpc: "2.0", id: 5, method: "tasks/result", params: { taskId: helpTaskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5'));
    const helpText = JSON.parse(stdoutLines.find((l) => l.includes('"id":5'))!).result.content[0].text as string;
    assert.match(helpText, /jobs management/);

    // 4. action=run (workflow case)
    send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {
      name: "jobs",
      arguments: { action: "run", jobId: "j-77" },
      _meta: { task: { ttl: 60_000 } },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":6'));
    const runCallLine = stdoutLines.find((l) => l.includes('"id":6'))!;
    const runTaskId = JSON.parse(runCallLine).result.task.taskId as string;
    assert.ok(runTaskId);

    let runStatus = "working";
    let pollId = 7;
    const start = Date.now();
    while (runStatus === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId: runTaskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker));
      runStatus = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!).result.status;
      pollId++;
      if (runStatus === "working") await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(runStatus, "completed");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId: runTaskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker));
    const runText = JSON.parse(stdoutLines.find((l) => l.includes(idMarker))!).result.content[0].text as string;
    assert.match(runText, /Job j-77 processed/);
    assert.match(runText, /Notification posted to: #ops/);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    if (!child.killed) child.kill();
  }
});
```

- [ ] **Step 3: Run both e2e tests**

Run: `npm test -- --test-name-pattern="plan 8 round-trip"`
Expected: both PASS — the dedicated workflow tool and the dispatcher fusion both green.

### Task 8.3: Run all eleven gates

- [ ] **Step 1: Full gate sweep**

Run: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt && just smoke-task && just smoke-task-one-tool`
Expected: all PASS (11 gates).

### Task 8.4: Compose the handoff

**Files:**
- Create: `.handoffs/YYYY-MM-DD-HHMM-jig-runtime-plan8-complete.md` (timestamp via `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`)

- [ ] **Step 1: Generate the Eastern-time timestamp**

Run: `TZ="America/New_York" date +"%Y-%m-%d-%H%M"`
Note the output; use it as the filename prefix.

- [ ] **Step 2: Compose the handoff using the `building-in-the-open:curating-context` skill**

The handoff should cover:

- Overall state (green, main carries Plan 8)
- What Plan 8 delivered (two acceptance YAMLs):
  - **Dedicated workflow tool path** (`examples/tasks.yaml`): `tools[].execution.taskSupport: "required" | "optional"`; `tasks:` top-level state-machine block (states with `mcpStatus`, `statusMessage`, `actions`, `on` transitions, terminal `result`); `workflow:` handler type that points at a named task workflow; `JigServerHandle.registerToolTask` adapter into `experimental.tasks`; `InMemoryTaskStore` advertised in the boot capabilities; state-machine interpreter that runs actions sequentially, evaluates JSONLogic transition guards (first match wins), Mustache-renders the terminal `result.text` against `{ input, result, probe }`.
  - **Dispatcher-task fusion path** (`examples/tasks-one-tool.yaml`): a task tool's outer handler can be `dispatch:` with cases routing to either workflows or synchronous handlers. `resolveDispatchCase` (extracted from `invokeDispatch`) is the shared case-matching helper. `registerTaskTool` walks the dispatch tree at `createTask` time: workflow cases drive the interpreter, non-workflow cases run synchronously and `storeTaskResult` immediately as one-step synthetic tasks. Single-tool spirit preserved.
- MCP methods added: `tools/call` on a task tool returns `CreateTaskResult` (not `CallToolResult`); `tasks/get` returns live `Task` with `mcpStatus` + `statusMessage`; `tasks/result` returns the rendered terminal `CallToolResult`. `tasks/cancel` flows through the SDK's default handler; the interpreter does not yet check for cancellation between actions.
- Key decisions:
  - SDK quarantine held — `tasks.ts`, `handlers/workflow.ts`, and `handlers/dispatch.ts`'s extracted helper import zero symbols from `@modelcontextprotocol/server`. The single SDK crossing for tasks is `server.experimental.tasks.registerToolTask` inside `server.ts` plus `InMemoryTaskStore` in the boot capabilities
  - `mcpStatus` set is restricted to `working`, `completed`, `failed` in v1. `input_required` is rejected at parse time pointing at Plan 9 (elicitation). `cancelled` is rejected at parse time as client-initiated only
  - Terminal-state shape constraints (declare `result`, no `actions`, no `on`) enforced at parse time so the interpreter can trust the shape
  - Action results are JSON-parsed before binding to `workflow.result` (falls back to raw text if not JSON), so JSONLogic guards like `{ "var": "result.valid" }` work against typed values
  - `interpretWorkflow` runs as a fire-and-forget after `createTask` returns — errors during interpretation become failed task results, never bubble out of the SDK callback
  - `updateTaskStatus` calls are best-effort (errors swallowed); only the terminal `storeTaskResult` is awaited
  - 1024-step interpreter cap to bound runaway loops in misconfigured workflows
  - **Dispatcher fusion preserves single-tool MCP spirit.** A future plan that adds nested dispatchers or workflows-as-actions can build on the same `findWorkflowRefs` walker — the cross-ref machinery is recursive-friendly
  - **Synthetic one-step tasks for non-workflow dispatch cases** keep the SDK contract uniform: every `tools/call` on a task tool returns `CreateTaskResult`, even for actions that complete instantly. Clients with `taskSupport: optional` get the SDK's auto-poll convenience for free
- Boot call order (final): `registerTools` (partition: plain tools → `registerTool`, task tools → `registerToolTask` with workflow-OR-dispatch outer handler routing) → `registerResources` (static + templated) → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`
- What's next: Plan 9 (elicitation — `input_required` mcpStatus + `elicitation/create` round-trip + state advancement on response) and Plan 10 (CLI + build pipeline)
- Landmines from this plan (see Landmines section below)
- Pre-dispatch scan guidance from prior plans carried forward

### Task 8.5: Commit Phase 8

- [ ] **Step 1: Write the commit message**

```
feat(runtime): plan 8 acceptance proof — smoke + e2e + handoff

Phase 8 of Plan 8 — the acceptance proof for both Phase-1
artifacts.

  - justfile: smoke-task drives examples/tasks.yaml (dedicated
    workflow tool) end-to-end. smoke-task-one-tool drives
    examples/tasks-one-tool.yaml (single-tool dispatcher) end-
    to-end, exercising both a non-workflow synthetic case (help)
    and a workflow case (run). Both via inline node helpers
    because the lifecycle needs cross-message state (per-process
    InMemoryTaskStore)
  - tests/integration.test.ts: TWO Plan 8 end-to-end round-trips
    pointing at the example YAMLs directly (no inline fixtures —
    the artifacts ARE the tests). If either YAML changes, the
    relevant test surfaces the change
  - .handoffs/…-plan8-complete.md: handoff for the next session

Plan 8 complete with this commit. Eleven gates pass:
npm run check, npm test, just smoke, just smoke-dispatch,
just smoke-compute, just smoke-http, just smoke-probe,
just smoke-resource, just smoke-prompt, just smoke-task,
just smoke-task-one-tool.
```

- [ ] **Step 2: Stage with specific paths**

```bash
git add \
  justfile \
  tests/integration.test.ts \
  .handoffs/
```

Clay: `gtxt && git pm`

---

## Self-review checklist

- **Spec coverage:** every numbered concept in the design doc's "Tasks and state machines" section maps to a phase task:
  - Acceptance YAML artifact set landed first → Phase 1 (BOTH `examples/tasks.yaml` AND `examples/tasks-one-tool.yaml`) ✓
  - `execution.taskSupport: required | optional | forbidden` → Phase 2 (forbidden rejected; required + optional accepted) ✓
  - `tasks:` top-level state-machine block → Phase 3 ✓
  - `initial:` / `states:` / `mcpStatus:` / `statusMessage:` / `actions:` / `on:` / `when:` / `result:` → Phase 3 schema, Phase 5 interpreter ✓
  - `handler: { workflow: { ref: ... } }` → Phase 5 ✓
  - JSONLogic guards on transitions → Phase 5 (`evalJsonLogic` reused) ✓
  - Sequential action invocation reusing existing handler types → Phase 5 ✓
  - Terminal state result shaping → Phase 5 (Mustache-rendered) ✓
  - Idempotency via task store → Phase 4 (InMemoryTaskStore handles get/get of same taskId) ✓
  - SDK adapter for `registerToolTask` → Phase 4 ✓
  - Boot partition by `execution.taskSupport` (simple workflow tools) → Phase 6 ✓
  - Strict cross-ref check (workflow-only outer) → Phase 6 ✓
  - **Single-tool dispatcher spirit preserved** → Phase 7 (dispatcher-task fusion: outer dispatch with workflow case routes to interpreter; non-workflow cases run as synthetic one-step tasks) ✓
  - **Relaxed cross-ref + `findWorkflowRefs` recursive walker** → Phase 7 ✓
  - **`resolveDispatchCase` extraction for shared case-matching** → Phase 7 ✓
  - smoke + e2e + handoff (proves BOTH Phase-1 artifacts boot) → Phase 8 ✓
- **Out-of-scope items explicitly named:** elicitation / `input_required` / `cancelled` author-declared / structured content / external event triggers / non-in-memory stores / `tasks/list` / persistence across restarts / parallel actions / `when:` clauses on dispatch cases under task tools (all in Scope Note + per-phase reminders + Landmines).
- **Type consistency:** `ExecutionConfig`, `TasksConfig`, `WorkflowSpec`, `StateSpec`, `TransitionSpec`, `WorkflowHandler`, `JigTaskHandler`, `RegisterTaskToolSpec`, `WorkflowRunHooks`, `InterpreterTaskStore`, `InterpretWorkflowOptions`, `ResolveDispatchResult` names are consistent across all phases.
- **No placeholders:** every step has either a code block, a concrete command, or an explicit deferred-to-later-phase comment.
- **SDK quarantine holds throughout:** `tasks.ts` imports only from `./config.ts`, `./server.ts`, `./handlers/types.ts`, `./util/jsonlogic.ts`, `./util/template.ts`. `handlers/dispatch.ts`'s `resolveDispatchCase` extraction adds no SDK imports. `handlers/index.ts`'s rejection branch imports nothing new. The single SDK crossing for tasks (`registerToolTask` + `InMemoryTaskStore` + task-related types) lives in `server.ts`.
- **File paths exact:** every Files block cites a real path from the existing repo or a new path in the right directory.
- **Commands with expected outputs:** every `Run:` step names the expected PASS/FAIL outcome.
- **Gate count accurate:** Phases 1-7 run 9 gates (smoke-prompt landed in Plan 7); Phase 8 adds `just smoke-task` AND `just smoke-task-one-tool` for 11 total.
- **Acceptance artifact set present from Phase 1:** BOTH `examples/tasks.yaml` and `examples/tasks-one-tool.yaml` land before any code. Phase 8's smoke recipes and e2e tests target each YAML directly. If either YAML changes, the corresponding tests surface the change.
- **Single-tool dispatcher spirit preserved.** A task tool can be a dispatcher with mixed case shapes (workflow + non-workflow). Without Phase 7, jig would force one-tool-per-workflow, breaking the streamlinear contract.

---

## Landmines

- **`InMemoryTaskStore` is per-process.** Restart wipes all in-flight tasks; clients with a `taskId` from a previous run get a "task not found" from `tasks/get`. Smoke-task drives the lifecycle inside a single process for this reason. A future plan adds a persistent backend.

- **`storeTaskResult` only accepts `'completed' | 'failed'`.** The interpreter maps `mcpStatus: completed` → store status `completed` and `mcpStatus: failed` → store status `failed`. There is no terminal `cancelled` author-declared status — `cancelled` is what the SDK records when the client calls `tasks/cancel`. Don't try to call `storeTaskResult(taskId, 'cancelled', ...)` — TypeScript blocks it; the runtime would too.

- **Action results are JSON-parsed before binding to `workflow.result`.** `inline: { text: '{"valid": true}' }` becomes `workflow.result = { valid: true }`, so `{ "var": "result.valid" }` evaluates to `true`. If parsing fails, the raw text becomes `workflow.result` (a string). Authors who want the raw text in JSONLogic must guard against the type — `{ "var": "result" }` may be a string OR an object. Document in the example YAML.

- **Workflow context shape is `{ input, result, probe }`.** Mustache rendering and JSONLogic both see this shape. There is NO `args` alias for `input`; there is NO `vars` alias for `result`. If a future state machine config uses `{{args.foo}}` it will silently render the empty string. Pre-flight scan for `{{args.` and `{{vars.` in example YAMLs.

- **`interpretWorkflow` is fire-and-forget after `createTask` returns.** If the interpreter throws (e.g. the JSONLogic engine has a bug), the error becomes a failed task result via `safeFail` — but if `safeFail` itself throws (the store is broken), the error is silently swallowed. The interpreter never crashes the runtime. This is by design — single-tool failures should not take down all other tools — but it does mean stuck tasks with no terminal result are possible if the store goes bad. Add an alert-on-stuck-task mechanism in a future plan if real configs need it.

- **`updateTaskStatus` failures are swallowed.** The interpreter does not block on status pushes — the rationale is that a transient failure to push a status update should not abort an in-progress workflow. The downside: clients that watch status updates may miss intermediate states. The terminal `storeTaskResult` IS awaited, so the final result is reliable.

- **`workflow:` handler MUST NOT reach `invoke()` in `handlers/index.ts`.** Phase 5 wires a rejection branch that throws "task-only handler" if it does. The only legitimate invocation is via `interpretWorkflow` inside the `createTask` callback. If a future plan adds nested workflows or workflow-as-action, redesign — the current model assumes workflows are top-level only.

- **`tasks/get` for an unknown taskId throws inside `getTask`.** The boot wiring's `getTask` callback throws `Error("tasks/get: task '...' not found")` when `store.getTask` returns null. The SDK translates this into a JSON-RPC error response. Clients should expect a standard error, not a default "empty task" object.

- **The 1024-step interpreter cap is silent.** A workflow that loops indefinitely (always-true guard pointing back to a prior state) hits the cap and fails with `interpreter: max steps exceeded — likely a transition loop`. There is no warning at lower step counts. If real configs need bigger workflows, adjust `MAX_STEPS` in `tasks.ts`.

- **Cross-ref check assumes both blocks have validated.** `crossRefTasks` runs after both `validateTools` and `validateTasks` complete. Don't add a new partial-parse path that calls `crossRefTasks` on a half-built config — the cross-ref errors will be misleading.

- **`registerToolTask`'s callback type is the SDK's `ToolTaskHandler<InputArgs>` generic.** TypeScript's overload resolution may fall through to the no-input variant when the cast site is too generic. The Phase 4 `cb as Parameters<RegisterToolTaskFn>[2]` cast handles both branches. Watch for type errors at the cast site after SDK version bumps; the cast pattern mirrors the `ToolCallback` cast already in `registerTool` and should be updated in lockstep.

- **Pre-dispatch scan pattern still applies.** Every plan from 4 onward caught code-block defects during pre-dispatch review. Scan Phase 4's `import("@modelcontextprotocol/server")` inline-import form (TypeScript may need it on a separate line as a `type` import in some module modes); scan Phase 5's `evalJsonLogic` import name (verify the actual export from `util/jsonlogic.ts`); scan Phase 6's `getTaskResult` cast (the SDK overload may not infer cleanly — fall back to the simpler cast in the note); scan the smoke recipes' inline-node helpers for shell-quoting issues. Catching these in pre-flight has saved real time on every prior plan.

- **Dispatch case `when:` clauses are NOT evaluated under task-tool fusion.** `resolveDispatchCase` (Phase 7) supports `requires:` evaluation but defers `when:` evaluation to the synchronous `invokeDispatch` path. A task tool whose dispatch case carries `when:` will silently match without evaluating the guard. If real configs need `when:` on task-tool dispatch cases, extend `resolveDispatchCase` and add a test — not in Plan 8 scope.

- **Synthetic one-step tasks have a fixed 60-second TTL.** Non-workflow dispatch cases under a task tool wrap into `store.createTask({ ttl: 60_000 })` then `storeTaskResult` immediately. The TTL is hardcoded because the case has no `ttl_ms` slot to declare it (only `workflow:` handlers carry `ttl_ms`). For most synthetic cases (which complete in milliseconds) this is fine. If an author needs a long TTL on a sync case, the workaround is to write it as a single-state workflow with an inline action and the desired `ttl_ms`.

- **Single-tool dispatcher requires `taskSupport` even when most cases are sync.** Per the relaxed cross-ref check, ANY workflow case in the dispatch tree forces the WHOLE tool to be a task tool. Authors who want a tool that's mostly sync but has one workflow action pay the "everything is a task" cost on that tool. The optimization (per-case task elevation) is interesting but adds significant complexity to the SDK contract — deferred indefinitely.

- **`registerTaskTool`'s `outerHandler` capture is closed over the partition loop.** Inside `index.ts`, the for-loop captures `tool` per iteration; `registerTaskTool(tool)` reads `tool.handler` AT BOOT TIME and closes over it for the lifetime of the process. If hot-reload arrives in a future plan, every per-tool closure must be invalidated and re-created — there is no `update()` path in v1.

- **Phase 6 → Phase 7 test relaxation watch-out.** A Phase-6 test that asserted "config rejects a task tool with a non-workflow handler" expected ANY non-workflow outer handler to fail, including dispatch. Phase 7 makes dispatch valid. The Task 7.3 note flags this — update the Phase-6 test's YAML to use `inline:` (still rejected) and update the error pattern. If you skip this update, Phase 7's gate sweep fails on a Phase-6 test that no longer reflects reality.
