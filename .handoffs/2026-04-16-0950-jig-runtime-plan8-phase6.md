# Handoff: Plan 8 — Phase 6 complete, Phases 7-8 remain

**Branch:** `feat/plan8-boot-simple` (Phase 6, awaiting `gtxt && git pm`)
**Plan:** `record/plans/2026-04-15-jig-runtime-plan8.md`
**State:** Green — 276 tests, 9 smoke gates pass

## What's done (Phases 0-6)

- **Phase 1:** Two acceptance YAMLs (`examples/tasks.yaml`, `examples/tasks-one-tool.yaml`)
- **Phase 2:** `ExecutionConfig` type + `validateExecution` on tools
- **Phase 3:** `TasksConfig` types + `validateTasks` in `src/runtime/tasks.ts`
- **Phase 4:** `registerToolTask` adapter + `InMemoryTaskStore` in `server.ts`
- **Phase 5:** `WorkflowHandler` in Handler union + `interpretWorkflow` in `tasks.ts` + invoke() rejection
- **Phase 6:** `crossRefTasks` strict check + boot partition in `index.ts` — `examples/tasks.yaml` boots end-to-end

## What remains

### Phase 7: Dispatcher-task fusion (`feat/plan8-dispatcher-fusion`)

Relaxes the strict cross-ref so a task tool's outer handler can be `dispatch:` (not just `workflow:`). This makes `examples/tasks-one-tool.yaml` boot.

Key tasks per the plan:
1. Extract `resolveDispatchCase` from `invokeDispatch` in `handlers/dispatch.ts` — shared case-matching helper
2. Write cross-ref tests for dispatch-with-workflow-cases (4 tests in `tasks.test.ts`)
3. Replace `crossRefTasks` body with `findWorkflowRefs` recursive walker
4. Update `registerTaskTool` in `index.ts` to handle dispatch outer handlers (branch on workflow vs sync cases)
5. **Update the Phase 6 test** "config rejects a task tool with a non-workflow handler" — its assertion pattern needs to match the relaxed error message (task tool outer handler must be workflow: or dispatch:, not just workflow:)
6. Write 3 fusion integration tests + verify both example YAMLs boot

### Phase 8: Smoke recipes + e2e + handoff (`feat/plan8-complete`)

1. `just smoke-task` and `just smoke-task-one-tool` recipes in justfile (inline node helpers — the `sendRpc` pattern doesn't work for tasks because `InMemoryTaskStore` keeps the event loop alive)
2. Two e2e integration tests against the actual example YAMLs
3. Full 11-gate sweep
4. Final handoff

## SDK protocol gotchas (learned in Phase 6, critical for Phase 7-8)

- **Client capabilities:** `{ tasks: { requests: { tools: { call: true } } } }` — NOT under `experimental`
- **Client must send `notifications/initialized`** after initialize, before task-augmented `tools/call`
- **Task params:** `params.task: { ttl }` at top level of params — NOT `params._meta.task`
- **Server capabilities:** Must include `requests: { tools: { call: true } } as Record<string, unknown>` in the tasks capability (SDK strips taskStore from wire caps, leaving `{}` without this)
- **Process lifecycle:** `InMemoryTaskStore` keeps the event loop alive. Integration tests must `child.kill()` explicitly. The `sendRpc` helper (pipe + wait for exit) hangs for task tools
- **`tasks-one-tool.yaml` uses `cases:` wrapper** under `dispatch:` — the plan doc omitted it but the existing Plan-2 dispatcher validator requires it (corrected in Phase 1)

## Boot call order (current)

`registerPlainTool` / `registerTaskTool` (partitioned) → `registerResources` → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`
