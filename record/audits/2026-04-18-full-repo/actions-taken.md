---
audit: 2026-04-18-Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples
last_updated: 2026-04-18
status:
  fixed: 23
  mitigated: 0
  accepted: 1
  disputed: 0
  deferred: 4
  open: 1
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

---

## 2026-04-18 — Require config version field, log workflow error paths

**Disposition:** fixed
**Addresses:** [no-schema-evolution-strategy](README.md#no-schema-evolution-strategy), [workflow-transition-silent-catch](README.md#workflow-transition-silent-catch), [status-update-fire-and-forget](README.md#status-update-fire-and-forget)
**Commit:** 8dd2d5f
**Author:** Clay Loveless + Claude

`version: "1"` is now required in all YAML configs. The parser rejects configs without a version field or with an unsupported version, and unknown root keys are rejected. All 10 example files and 168 test YAML blocks updated. This establishes the forward-compatibility strategy before any users exist.

`pickTransition` now logs `when:` guard evaluation errors to stderr before skipping, making broken guards visible instead of silently discarded. Task status update failures in the fire-and-forget `.catch()` body are logged to stderr instead of swallowed.

---

## 2026-04-18 — Consolidate duplicated helpers and merge engine module

**Disposition:** fixed
**Addresses:** [triplicate-stringify](README.md#triplicate-stringify), [duplicate-render-json-leaves](README.md#duplicate-render-json-leaves), [duplicate-error-result](README.md#duplicate-error-result), [getengine-exported-from-util](README.md#getengine-exported-from-util), [dead-re-export-inline](README.md#dead-re-export-inline)
**Commit:** bd2c88b
**Author:** Clay Loveless + Claude

Extracted `stringify()` to `util/stringify.ts` (3 identical copies removed). Moved `renderJsonLeaves()` to `util/template.ts` (2 copies removed). Exported `errorResult()` from `handlers/types.ts` (5 copies removed). Merged `helpers.ts` into `jsonlogic.ts` so the engine singleton never leaves the module — `getEngine()` eliminated entirely. Removed dead `ToolCallResult` re-export from `handlers/inline.ts`. Net -94 lines.

---

## 2026-04-18 — Bound response bodies, unify response mode, evaluate dispatch guards

**Disposition:** fixed
**Addresses:** [unbounded-http-response-body](README.md#unbounded-http-response-body), [default-env-allowlist-exposes-path](README.md#default-env-allowlist-exposes-path), [response-mode-synonym](README.md#response-mode-synonym), [security-validation-copy-paste](README.md#security-validation-copy-paste), [probe-handler-not-deep-validated](README.md#probe-handler-not-deep-validated), [when-guards-skipped-in-task-dispatch-fusion](README.md#when-guards-skipped-in-task-dispatch-fusion)
**Commit:** 6eb1400
**Author:** Clay Loveless + Claude

Added 10 MB response body size limit via streaming reader in `performFetch`, preventing unbounded memory growth. Removed `PATH` from default env allowlist. Unified graphql response mode to `"body" | "envelope"` matching http, accepting `"data"` as a deprecated alias. Extracted `validateSecurityBlock()` to replace three identical allow-array validation blocks. Validated probe handlers through `validateHandlerPublic` at parse time. Evaluated `when:` guards in the task-dispatch fusion path, closing the bypass where guarded workflow cases skipped the guard under task-tool fusion.

---

## 2026-04-18 — Cache connection headers, expose exec maxBuffer, disposition remaining

**Disposition:** fixed
**Addresses:** [connection-headers-re-evaluated-per-request](README.md#connection-headers-re-evaluated-per-request), [exec-stdout-default-maxbuffer](README.md#exec-stdout-default-maxbuffer)
**Commit:** (pending — this branch)
**Author:** Clay Loveless + Claude

Cache resolved connection headers after first evaluation via WeakMap. Rules evaluate against an empty context so the result is deterministic for the process lifetime. Added optional `max_output_bytes` field to exec handler config (defaults to 1 MB, matching Node.js). Kept `tools.listChanged: true` capability — hot-reload is planned.

---

## 2026-04-18 — tools-list-changed: accepted (hot-reload planned)

**Disposition:** accepted
**Addresses:** [tools-list-changed-advertised-never-fired](README.md#tools-list-changed-advertised-never-fired)

The `listChanged: true` capability is pre-declared intentionally. Hot-reload is a planned feature that will fire `sendToolListChanged()` when the YAML is reloaded. Well-behaved clients handle the capability silently until the notification fires. Updated comment to document intent.

---

## 2026-04-18 — mcp-server-pinned-alpha: deferred to SDK stable release

**Disposition:** deferred
**Addresses:** [mcp-server-pinned-alpha](README.md#mcp-server-pinned-alpha)

The `@modelcontextprotocol/server` pin at exact `2.0.0-alpha.2` is intentional during alpha. Switch to `^2.0.0` when a stable 2.0.0 ships. Target: SDK 2.0.0 stable release.

---

## 2026-04-18 — no-user-facing-documentation: deferred to next session

**Disposition:** deferred
**Addresses:** [no-user-facing-documentation](README.md#no-user-facing-documentation)

README and user-facing documentation requires a dedicated session to assemble content from design docs, example comments, and the YAML schema reference. Target: documentation session.

---

## 2026-04-18 — cli-surface-not-implemented: deferred to Plan 10

**Disposition:** deferred
**Addresses:** [cli-surface-not-implemented](README.md#cli-surface-not-implemented)

The six CLI commands (jig new/dev/validate/build/serve/inspect) are Plan 10 scope. Target: Plan 10 implementation.

---

## 2026-04-18 — stdio-only-transport: deferred to Streamable HTTP implementation

**Disposition:** deferred
**Addresses:** [stdio-only-transport](README.md#stdio-only-transport)

Streamable HTTP transport is planned. The server.ts adapter already accepts a Transport interface, so the implementation is additive. Target: transport implementation session.
