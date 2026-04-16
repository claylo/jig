# Handoff: Plan 9 complete — elicitation

**Date:** 2026-04-16
**Branch:** `feat/plan9-complete` (Phase 5, awaiting `gtxt && git pm`)
**State:** Green — 302 tests, 12 smoke gates pass

## Where things stand

Plan 9 is complete. All 6 phases (0-4 merged to main, Phase 5 staged on the feature branch) deliver the `input_required` mcpStatus, the `elicitation:` block on states, form-mode `elicitation/create` round-trip, and elicitation response binding in `workflowCtx.elicitation`. The acceptance YAML (`examples/tasks-elicitation.yaml`) boots and passes the smoke gate + end-to-end lifecycle tests.

## What Plan 9 delivered

- **`mcpStatus: input_required`** unlocked on workflow states — third shape alongside `working` and terminal (`completed`/`failed`)
- **`elicitation:` block** on `input_required` states with `message`, `schema` (typed form fields), and optional `required` array
- **Parse-time validation** of elicitation field types (`string`, `boolean`, `number`, `integer`, `array`) with SDK-compatible property options (enum, format, min/max, etc.)
- **Shape constraints** for `input_required` states: must have `elicitation:` + `on:`, must not have `actions:` or `result:`
- **SDK quarantine preserved** — `elicit` callback threaded from `ctx.mcpReq.elicitInput` in `server.ts` through `JigTaskHandler.createTask` → `startWorkflowTask` → `interpretWorkflow` as jig-typed `ElicitParams => ElicitResponse`
- **Interpreter `input_required` handling** — calls `elicit()` with `buildRequestedSchema()` output, binds `{ action, ...content }` to `workflowCtx.elicitation`, evaluates transitions against enriched context
- **`elicitation.action`** exposed at `workflowCtx.elicitation.action` for explicit decline/cancel routing via JSONLogic guards
- **Mustache rendering** of elicitation fields in terminal result text (`{{elicitation.name}}`)
- **`just smoke-task-elicitation`** — inline Node helper drives the full elicitation lifecycle (initialize with form capability, tools/call, elicitation/create response, tasks/get poll, tasks/result)
- **Auto-title** on form fields — `title` defaults to capitalized field name when YAML author omits it

## Decisions made

- **Form mode only (v1).** URL-mode elicitation requires Streamable HTTP transport — deferred.
- **No actions on `input_required` states.** Pre-elicitation work belongs in the prior state. Keeps the interpreter path clean.
- **Content fields spread into `elicitation` namespace.** `workflowCtx.elicitation = { action, ...content }` so `{ "var": "elicitation.approved" }` naturally returns falsy on decline/cancel (field doesn't exist). No special-casing needed.
- **`InterpreterTaskStore.updateTaskStatus` widened** to accept `"input_required"` alongside `"working"`, `"completed"`, `"failed"`.
- **SDK assigns `id: 0` to elicitation requests.** Smoke and integration tests use `!== undefined && !== null` checks, not `!id` (falsy-zero bug caught and fixed during Phase 5).

## What's next

1. **Plan 10: CLI** — `jig new|dev|validate|build` + build pipeline.

## Landmines

- **SDK `elicitation/create` has `id: 0`.** Client code that checks `!id` will treat it as missing. Always use `id !== undefined && id !== null`.
- **`elicitation/create` may arrive on stdout BEFORE the `tools/call` response.** The SDK fires the elicitation as the interpreter enters the `input_required` state, which can happen before the `createTask` response is flushed. Integration tests must handle both orderings.
- **`elicitation: { form: {} }` required in client capabilities.** The initialize request must advertise form elicitation support via `capabilities.elicitation.form`, otherwise the SDK throws `CapabilityNotSupported`.
- **InMemoryTaskStore + event loop** — same as Plan 8. Child processes must be killed explicitly; `stdin.end()` + wait-for-close hangs forever.
- **Stderr pipe blocking** — same as Plan 8. Drain stderr in all integration tests and smoke helpers.

## Gate inventory (12)

`npm run check`, `npm test` (302), `just smoke`, `just smoke-dispatch`, `just smoke-compute`, `just smoke-http`, `just smoke-probe`, `just smoke-resource`, `just smoke-prompt`, `just smoke-task`, `just smoke-task-one-tool`, `just smoke-task-elicitation`
