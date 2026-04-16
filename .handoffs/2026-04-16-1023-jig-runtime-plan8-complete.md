# Handoff: Plan 8 complete — tasks + state machines

**Date:** 2026-04-16
**Branch:** `feat/plan8-complete` (Phase 8, awaiting `gtxt && git pm`)
**State:** Green — 285 tests, 11 smoke gates pass

## Where things stand

Plan 8 is complete. All 8 phases (0-7 merged to main, Phase 8 staged on the feature branch) deliver the `tasks:` state-machine surface, `execution.taskSupport` on tools, the `workflow:` handler type, the `InMemoryTaskStore`-backed task lifecycle, and dispatcher-task fusion. Both acceptance YAMLs (`examples/tasks.yaml`, `examples/tasks-one-tool.yaml`) boot and pass end-to-end lifecycle tests + dedicated smoke recipes.

## What Plan 8 delivered

- **`execution.taskSupport: required | optional`** on `tools[]` — opts tools into the MCP experimental task lifecycle
- **`tasks:` top-level block** — named state-machine workflows (states with `mcpStatus`, `statusMessage`, sequential `actions`, guarded `on` transitions, terminal `result`)
- **`workflow:` handler type** — routes a task tool through the state-machine interpreter; rejected at invoke() with a clear error (task-only)
- **`registerToolTask` adapter** in `server.ts` — bridges into `server.experimental.tasks.registerToolTask` with `InMemoryTaskStore`
- **State-machine interpreter** (`interpretWorkflow` in `tasks.ts`) — runs actions via existing `invoke()`, evaluates JSONLogic transition guards, Mustache-renders terminal `result.text` against `{ input, result, probe }`
- **Boot partition** in `index.ts` — tools with `execution.taskSupport` route through `registerToolTask`; others keep `registerTool`
- **Dispatcher-task fusion** — a task tool's outer handler can be `dispatch:` (not just `workflow:`); `resolveDispatchCase` extracted from `invokeDispatch` as shared helper; workflow cases drive the interpreter, non-workflow cases run as synthetic one-step tasks
- **`just smoke-task` + `just smoke-task-one-tool`** — inline Node helpers that drive the full task lifecycle (initialize, tools/call, tasks/get poll, tasks/result)

## Decisions made

- **SDK quarantine held.** `tasks.ts` and `handlers/workflow.ts` import zero symbols from `@modelcontextprotocol/server`. The single SDK crossing is `server.ts`.
- **`mcpStatus` restricted to `working | completed | failed`.** `input_required` rejected at parse time pointing at Plan 9. `cancelled` rejected as client-initiated only.
- **`interpretWorkflow` is fire-and-forget.** Errors become failed task results via `safeFail`, never bubble out of the SDK callback. `updateTaskStatus` is best-effort (swallowed on failure); only terminal `storeTaskResult` is awaited.
- **1024-step interpreter cap** bounds runaway loops in misconfigured workflows.
- **Synthetic one-step tasks for non-workflow dispatch cases** — uniform `CreateTaskResult` contract regardless of case type.
- **`when:` clauses on dispatch cases are NOT evaluated under task-tool fusion** — documented as a known limitation.

## What's next

1. **Plan 9: Elicitation** — `input_required` mcpStatus + `elicitation/create` round-trip + state advancement on client response. The parse-time rejections for `input_required` and `elicitation:` keys already point at Plan 9.
2. **Plan 10: CLI** — `jig new|dev|validate|build` + build pipeline.

## Landmines

- **`InMemoryTaskStore` keeps Node's event loop alive.** Integration tests and smoke recipes MUST `child.kill()` explicitly — `child.stdin.end()` + wait-for-close hangs forever. The `sendRpc` pipe-and-exit helper does NOT work for task tools.
- **Stderr pipe blocking in integration tests.** Child processes spawned with `stdio: ["pipe", "pipe", "pipe"]` MUST drain stderr (`child.stderr.on("data", () => {})`) or the child blocks on a full stderr buffer (~64KB from experimental-transform-types warnings), which blocks stdout, which deadlocks `waitForLine`. This bit Phase 7 hard.
- **Client must send `notifications/initialized` after initialize.** Without it, the SDK silently drops `tools/call` for task tools. All integration tests include this.
- **Task params use `task: { ttl }` at the top level of `tools/call` params** — NOT under `_meta.task`.
- **Action results are JSON-parsed before binding to `workflow.result`.** `'{"valid": true}'` becomes `{ valid: true }`. Non-JSON text becomes a raw string. Authors using JSONLogic guards must know the type they're guarding against.
- **Boot call order (final):** `registerPlainTool` / `registerTaskTool` (partitioned) -> `registerResources` -> `registerPrompts` -> `trackSubscriptions` -> `wireCompletions` -> `startWatchers` -> `server.connect`

## Gate inventory (11)

`npm run check`, `npm test` (285), `just smoke`, `just smoke-dispatch`, `just smoke-compute`, `just smoke-http`, `just smoke-probe`, `just smoke-resource`, `just smoke-prompt`, `just smoke-task`, `just smoke-task-one-tool`
