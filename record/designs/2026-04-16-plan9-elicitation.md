# Plan 9 Design: Elicitation

**Date:** 2026-04-16
**Status:** Approved
**Depends on:** Plan 8 (tasks + state machines)

## Problem

Plan 8 delivered the `tasks:` state-machine surface with `working`, `completed`, and `failed` states. But the design doc's motivating example — a job pipeline that pauses for human approval — requires `input_required` states where the workflow blocks on client input and resumes on the response. Plan 8 explicitly rejected `input_required` and `elicitation:` at parse time with "Plan 9" error messages. This plan removes those gates and wires the round-trip.

## Approach

### Form-mode elicitation only (v1)

The MCP SDK supports two elicitation modes:

- **Form mode** (`mode: "form"` or omitted): server sends a `message` + `requestedSchema` describing typed form fields; client renders a form; client returns `{ action, content }`.
- **URL mode** (`mode: "url"`): server sends a URL; client opens it; server gets notified on completion via `notifications/elicitation/complete`.

Plan 9 implements **form mode only**. URL mode requires the server to host HTTP endpoints (a Streamable HTTP transport concern) and is out of scope for stdio-based v1.

### YAML surface

A state with `mcpStatus: input_required` declares an `elicitation:` block:

```yaml
awaiting_approval:
  mcpStatus: input_required
  statusMessage: "Waiting for approval"
  elicitation:
    message: "Approve to continue?"
    schema:
      approved:
        type: boolean
        description: "Check to approve this job"
  on:
    - target: executing
      when: { "var": "elicitation.approved" }
    - target: rejected
      when: { "==": [{ "var": "elicitation.action" }, "decline"] }
    - target: failed
```

### `input_required` state shape constraints

- **MUST** have `elicitation:` (the client needs to know what to ask)
- **MUST** have `on:` (need transitions after the response)
- **MUST NOT** have `result:` (not terminal)
- **MUST NOT** have `actions:` (pre-elicitation work belongs in the prior state; keeps the interpreter's `input_required` path clean)

This makes `input_required` a third shape alongside non-terminal (`working`) and terminal (`completed`/`failed`).

### Elicitation block validation

The `elicitation:` block has two required fields:

- `message` (string) — displayed to the user
- `schema` (mapping) — property definitions for the form

Each property in `schema` supports the SDK's form field types:

| `type` | Optional fields |
|--------|----------------|
| `string` | `description`, `enum`, `enumNames`, `oneOf`, `format` (`email`, `date`, `uri`, `date-time`), `minLength`, `maxLength`, `default` |
| `boolean` | `description`, `default` |
| `number`, `integer` | `description`, `minimum`, `maximum`, `default` |
| `array` | `description`, `items: { type: string, enum: [...] }`, `minItems`, `maxItems`, `default` |

Parse-time validation checks `type` is one of the above and rejects unknown keys. The `title` field on each property defaults to the property name (capitalized) if not provided — the SDK requires it, but YAML authors shouldn't have to write it for every field.

An optional top-level `required` array lists field names that the client must collect:

```yaml
elicitation:
  message: "Configure the deployment"
  required: [environment]
  schema:
    environment:
      type: string
      enum: [staging, production]
    notify:
      type: boolean
      default: true
```

### Threading `elicitInput` through the SDK quarantine

The interpreter (`tasks.ts`) stays SDK-free. A new `elicit` callback joins the existing `invoke` callback in `InterpretWorkflowOptions`:

```typescript
export interface InterpretWorkflowOptions {
  workflow: WorkflowSpec;
  args: Record<string, unknown>;
  ctx: InvokeContext;
  store: InterpreterTaskStore;
  taskId: string;
  invoke: (handler: Handler, args: Record<string, unknown>, ctx: InvokeContext) => Promise<ToolCallResult>;
  elicit: (params: ElicitParams) => Promise<ElicitResponse>;
}
```

Where `ElicitParams` and `ElicitResponse` are jig-owned types (not SDK types):

```typescript
export interface ElicitParams {
  message: string;
  requestedSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ElicitResponse {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}
```

In `server.ts`, the `registerToolTask` adapter captures `ctx.mcpReq.elicitInput` from the SDK's `CreateTaskServerContext` and threads it through to `startWorkflowTask` in `index.ts`, which passes it to `interpretWorkflow`.

### Interpreter behavior for `input_required` states

When the interpreter enters a state with `mcpStatus: input_required`:

1. Push `updateTaskStatus(taskId, "input_required", statusMessage)` (best-effort, same as `working`)
2. Build the SDK's `requestedSchema` from the state's `elicitation.schema` + `elicitation.required`
3. Call `elicit({ message, requestedSchema })`
4. If the call throws (client doesn't support elicitation, network error), `safeFail` the task
5. Bind the response to `workflowCtx.elicitation`:
   ```typescript
   workflowCtx.elicitation = {
     action: result.action,
     ...result.content,  // spread content fields into elicitation namespace
   };
   ```
6. Evaluate `on:` transitions against the updated `workflowCtx`
7. If no transition matches, `safeFail` (same as today)

The `action` field is always present. Content fields are only present when `action === "accept"`. Guards like `{ "var": "elicitation.approved" }` naturally return falsy for decline/cancel (the field doesn't exist), so a simple "approve or fail" pattern just works without explicit action checks.

### `InterpreterTaskStore` update

`updateTaskStatus` currently accepts `"working" | "completed" | "failed"`. Add `"input_required"` to the union:

```typescript
updateTaskStatus(
  taskId: string,
  status: "working" | "input_required" | "completed" | "failed",
  statusMessage?: string,
): Promise<void>;
```

### Config types update

`StateSpec.mcpStatus` widens from `"working" | "completed" | "failed"` to `"working" | "input_required" | "completed" | "failed"`.

New type for the elicitation block:

```typescript
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

export interface ElicitationSpec {
  message: string;
  required?: string[];
  schema: Record<string, ElicitationFieldSpec>;
}
```

`StateSpec` gains an optional `elicitation?: ElicitationSpec` field, required when `mcpStatus === "input_required"`.

## Out of scope

- **URL-mode elicitation** — requires Streamable HTTP transport, deferred
- **`cancelled` as author-declared terminal** — still client-initiated only
- **Structured content in terminal results** — still `result: { text }` only
- **Elicitation retries** — if the client declines, the author handles it via transitions; no built-in retry loop
- **Elicitation timeout** — the SDK/client owns the timeout; jig awaits the promise

## Files touched

| File | Change |
|------|--------|
| `src/runtime/config.ts` | Add `ElicitationFieldSpec`, `ElicitationSpec` to types; widen `StateSpec.mcpStatus` |
| `src/runtime/tasks.ts` | Remove `input_required` / `elicitation:` rejections; add validation for `elicitation:` block; add `elicit` to `InterpretWorkflowOptions`; implement `input_required` state handling in interpreter; add `ElicitParams` / `ElicitResponse` types |
| `src/runtime/server.ts` | Widen `InterpreterTaskStore.updateTaskStatus` status union; thread `elicitInput` from SDK context through `JigTaskHandler`; add jig-typed `elicit` to `JigTaskHandler.createTask` signature |
| `src/runtime/index.ts` | Pass `elicit` callback from `server.ts` through `startWorkflowTask` to `interpretWorkflow` |
| `tests/tasks.test.ts` | Flip `input_required` / `elicitation` rejection tests to acceptance; add `input_required` state validation tests; add interpreter elicitation round-trip tests |
| `examples/tasks-elicitation.yaml` | New acceptance YAML demonstrating the full elicitation round-trip |
| `justfile` | Add `smoke-task-elicitation` recipe |
