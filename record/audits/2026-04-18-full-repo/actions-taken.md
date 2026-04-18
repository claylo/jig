---
audit: 2026-04-18-Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples
last_updated: 2026-04-18
status:
  fixed: 7
  mitigated: 0
  accepted: 0
  disputed: 0
  deferred: 0
  open: 22
---

# Actions Taken: Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples

Summary of remediation status for the [2026-04-18 Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples audit](README.md).

---

## 2026-04-18 — Close exec arg injection and workflow crash path

**Disposition:** fixed
**Addresses:** [exec-arg-injection-via-whitespace-split](README.md#exec-arg-injection-via-whitespace-split), [workflow-fire-and-forget-unhandled-rejection](README.md#workflow-fire-and-forget-unhandled-rejection), [fetch-response-body-read-uncaught](README.md#fetch-response-body-read-uncaught), [get-task-result-null-cast](README.md#get-task-result-null-cast)
**Commit:** 502b28f
**Author:** Clay Loveless + Claude

The exec handler now accepts `exec` as either a string (legacy, backward-compatible) or an array of strings. In the array form, each element is template-rendered independently and becomes exactly one argv entry regardless of content, eliminating argument injection via whitespace-splitting. The string form is preserved for backward compatibility. Config validation and probes updated to accept both forms. Tests added for the array form including an explicit argument-injection-neutralization assertion.

The detached `void interpretWorkflow(...)` promise now has a `.catch()` handler that writes to stderr and stores a failed task result, preventing unhandled rejections from crashing the process. The `response.text()` call in `fetch.ts` is now inside a try-catch matching the pattern for the `fetch()` call above it, closing the chain that enabled the workflow crash path. The `getTaskResult` null cast was replaced with a null guard matching the adjacent `getTask` pattern.

---

## 2026-04-18 — Reject unknown tool keys, invalid input types, and duplicate names

**Disposition:** fixed
**Addresses:** [tool-unknown-keys-not-rejected](README.md#tool-unknown-keys-not-rejected), [input-type-not-validated](README.md#input-type-not-validated), [tool-name-uniqueness-not-enforced](README.md#tool-name-uniqueness-not-enforced)
**Commit:** bfbb792
**Author:** Clay Loveless + Claude

Tool entries now reject unknown keys using the same pattern as every other config block, so a YAML author writing `gaurd:` instead of `guard:` gets a clear parse-time error. `InputFieldSchema.type` is validated against the six allowed values (`string`, `integer`, `number`, `boolean`, `object`, `array`) instead of accepting any string via an unchecked cast. Tool names are tracked with a `seenNames` set matching the pattern in `validatePrompts`, rejecting duplicates at parse time.
