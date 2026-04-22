---
audit: 2026-04-21-Full repo audit — src/runtime, src/cli, examples, and tests
last_updated: 2026-04-21
status:
  fixed: 12
  mitigated: 0
  accepted: 0
  disputed: 0
  deferred: 0
  open: 0
---

# Actions Taken: Full repo audit — src/runtime, src/cli, examples, and tests

Summary of remediation status for the [2026-04-21 Full repo audit — src/runtime, src/cli, examples, and tests audit](README.md).

---

## 2026-04-21 — Remove string-form exec handler entirely

**Disposition:** fixed
**Addresses:** [exec-string-argv-injection](README.md#exec-string-argv-injection)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

Removed the string-form `exec` handler completely. The `ExecHandler` type now
requires `exec: string[]` — no string form, no whitespace splitting, no argument
injection surface. The config validator rejects `exec: "..."` with a clear error
message directing authors to use the array form. Updated all examples, tests,
README documentation, and the `ProbeHandler` type to match.

The string form was introduced in PR #9 and survived PR #72's "fix" because that
PR added the array form alongside the string form rather than replacing it.

---

## 2026-04-21 — Encode interpolated HTTP path segments

**Disposition:** fixed
**Addresses:** [http-path-template-traversal](README.md#http-path-template-traversal)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

Added `renderUriEncoded()` to `src/runtime/util/template.ts` — same as `render()`
but applies `encodeURIComponent()` to each interpolated value while leaving literal
template text unchanged. The HTTP handler now uses this for path rendering, so a
caller-supplied `{{id}}` containing `../` or `?` characters gets encoded into a
single path segment instead of reshaping the URL.

---

## 2026-04-21 — Add Host/Origin validation to HTTP transport

**Disposition:** fixed
**Addresses:** [http-transport-dns-rebinding](README.md#http-transport-dns-rebinding)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

The HTTP transport now validates the `Host` header against a set of known loopback
addresses (127.0.0.1, localhost, ::1) plus the configured hostname, all with the
bound port. Requests with an unrecognized Host get a 403. Browser requests that
include an `Origin` header are checked against an explicit allowlist
(`allowedOrigins` option); if no allowlist is configured, all Origin-bearing
requests are rejected. Non-browser clients (curl, MCP SDKs) that omit Origin are
unaffected.

---

## 2026-04-21 — Move --version check before subcommand dispatch

**Disposition:** fixed
**Addresses:** [cli-version-flag-never-reaches-version-branch](README.md#cli-version-flag-never-reaches-version-branch)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Moved the `-V`/`--version` check to run before `parseArgs` and the no-command
bail-out in `src/cli/index.ts`. `jig --version` now prints the version instead
of showing the usage banner.

---

## 2026-04-21 — Enable --no-watch negation in dev command

**Disposition:** fixed
**Addresses:** [dev-no-watch-flag-is-not-supported](README.md#dev-no-watch-flag-is-not-supported)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Added `negatable: true` to the `watch` option in `src/cli/dev.ts`. Node's
`parseArgs` strict mode now accepts `--no-watch` and sets `values.watch` to
`false`, matching the documented behavior in the help text.

---

## 2026-04-21 — Wire --port into build output via embeddedPort

**Disposition:** fixed
**Addresses:** [build-port-flag-is-ignored](README.md#build-port-flag-is-ignored)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Added `embeddedPort` to `src/runtime/embedded-config.ts` alongside `embeddedYaml`.
The build command now validates the `--port` value and emits it into the esbuild
plugin's generated module. The runtime reads `embeddedPort` as a fallback when no
`--port` CLI arg is present, so a built artifact with `--port 8080` serves HTTP
by default while still allowing runtime override via `--port`.

---

## 2026-04-21 — Require exactly one handler type per tool

**Disposition:** fixed
**Addresses:** [handler-parsing-is-order-dependent](README.md#handler-parsing-is-order-dependent)
**Commit:** pending (staged on fix/audit-runtime-hardening)
**Author:** Clay Loveless + Claude

Rewrote `validateHandler()` in `src/runtime/config.ts` to count recognized handler
keys first, reject when more than one is present, then dispatch to the subtype
validator via a switch. The implicit first-match ordering is gone — a handler with
both `exec` and `inline` now gets a clear error instead of silently ignoring one.

---

## 2026-04-21 — Surface guard errors in workflow task results

**Disposition:** fixed
**Addresses:** [transition-guard-errors-collapse-to-generic-stall](README.md#transition-guard-errors-collapse-to-generic-stall)
**Commit:** pending (staged on fix/audit-runtime-hardening)
**Author:** Clay Loveless + Claude

`pickTransition()` now returns a `TransitionResult` with an optional `guardError`
field. When a `when:` guard throws, the error is captured and — if no other
transition matches — surfaced in the task failure message instead of collapsing
to the generic "workflow stalled" result.

---

## 2026-04-21 — Log rejected terminal writes in safeFail

**Disposition:** fixed
**Addresses:** [task-result-write-failures-swallowed](README.md#task-result-write-failures-swallowed)
**Commit:** pending (staged on fix/audit-runtime-hardening)
**Author:** Clay Loveless + Claude

The empty `catch` in `safeFail()` now writes both the original workflow failure
message and the store rejection error to stderr. The store is still the only
output channel for the task result, but an operator watching logs will see both
failures instead of silent disappearance.

---

## 2026-04-21 — Decompose workflow interpreter into phase functions

**Disposition:** fixed
**Addresses:** [workflow-interpreter-is-too-dense](README.md#workflow-interpreter-is-too-dense)
**Commit:** pending (staged on refactor/workflow-interpreter)
**Author:** Clay Loveless + Claude

Rewrote `interpretWorkflow()` as a thin orchestration loop over typed phase
functions. Introduced `StepOutcome` discriminated union (`advance` | `terminal`
| `failed`) so each phase returns a value instead of calling `safeFail()` and
returning void. The top-level loop reads the outcome and dispatches.

Extracted: `executeState()` (per-state dispatch), `runElicitation()`,
`runActions()`, `renderTerminal()`, `resolveTransition()`, `emitStatus()`.
Each owns one concern and can be changed without reading the others. Renamed
`safeFail()` to `fail()`. Added `WorkflowCtx` interface.

Same behavior, same 349 tests passing, same error messages.

---

## 2026-04-21 — Implement webhook watcher type

**Disposition:** fixed
**Addresses:** [webhook-watcher-type-advertised-but-rejected](README.md#webhook-watcher-type-advertised-but-rejected)
**Commit:** pending (staged on fix/audit-docs-parity)
**Author:** Clay Loveless + Claude

Implemented the `webhook` watcher type that the README and design doc advertise.
Added `{ type: "webhook"; port: number; path?: string }` to `WatcherSpec` in
config.ts. The validator accepts `webhook` alongside `polling` and `file`, requires
a `port` (integer 1-65535), and accepts an optional `path` (defaults to `/webhook`).

`startWebhookWatcher()` in resources.ts starts a lightweight HTTP server on the
configured port bound to 127.0.0.1. A POST to the webhook path fires
`notifications/resources/updated` for the resource's URI (if subscribed) and
returns 204. All other methods/paths return 404. The server logs its listen
address to stderr at boot and cleans up on dispose.

Added tests: config accepts webhook watcher, config rejects webhook without port.

---

## 2026-04-21 — Eagerly resolve connection headers at boot

**Disposition:** fixed
**Addresses:** [env-vars-are-not-resolved-at-boot](README.md#env-vars-are-not-resolved-at-boot)
**Commit:** pending (staged on fix/audit-docs-parity)
**Author:** Clay Loveless + Claude

Added eager `resolveHeaders()` call for every compiled connection immediately
after `compileConnections()` in `src/runtime/index.ts`. Missing env vars now
cause a boot failure with a clear error message (`connection "X" header
resolution failed at boot: ...`) instead of silently surviving startup and
failing on the first outbound request. The README's claim that `${VAR}` is
"resolved at boot" is now accurate.
