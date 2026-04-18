---
audit_date: 2026-04-18
project: jig
commit: d825be6546b4291dba1d8bf85b390b295004e89d
scope: Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples
auditor: claude-opus-4-6 (cased skill, xhigh effort)
findings:
  critical: 0
  significant: 4
  moderate: 11
  advisory: 10
  note: 4
---

# Audit: jig

jig is a 4-day-old TypeScript MCP server runtime (~5.1k LOC) with a
disciplined architecture: strict TypeScript, clean module boundaries,
and extensive test coverage across 18 test files. **The Tool Dispatch
Boundary** has one exploitable argument injection in the exec handler
where whitespace-splitting of template-rendered commands lets MCP clients
inject arbitrary flags into child processes. **The Error Propagation
Surface** has a fire-and-forget promise launch that crashes the server
on unhandled rejections in the workflow subsystem. **The Config Schema
Surface** is thorough but lacks a version evolution strategy and has
five validation gaps where the YAML author gets silent acceptance instead
of the loud-failure pattern used everywhere else. **The Network Boundary
Surface**, **Code Maintenance Surface**, **Completeness Surface**, and
**Supply Chain Surface** are all in good shape for an alpha-stage
project. Fix the exec handler argument injection and the workflow crash
path, and this is a strong foundation.

---

## The Tool Dispatch Boundary

*The dispatch path from MCP tool call to handler execution has one
exploitable argument injection and four config validation gaps that
silently accept invalid YAML.*

### Argument injection in exec handler via whitespace-splitting of template-rendered command

**significant** · `src/runtime/handlers/exec.ts:27-28` · effort: medium · <img src="assets/sparkline-exec-arg-injection-via-whitespace-split.svg" height="14" alt="commit activity" />

The exec handler renders user-controlled MCP tool-call arguments into a
Mustache template, then splits the rendered string on whitespace to
produce an argv array. Because the template engine performs no escaping
or quoting, an attacker-controlled argument containing spaces produces
additional argv elements passed to `execFile`. While `execFile` without
`shell: true` prevents shell metacharacter injection, argument injection
is fully reachable: the attacker can inject arbitrary flags and
positional arguments. For many commands (git, tar, rsync, curl), injected
arguments enable arbitrary file read, write, or code execution.

```typescript src/runtime/handlers/exec.ts:27-28
const rendered = render(handler.exec, { ...args, probe: ctx.probe });
const argv = rendered.trim().split(/\s+/).filter((part) => part.length > 0);
```

> I control the MCP tool arguments. The template substitutes my input
> into the command string, then whitespace-splits it into argv. If I
> send `action: "--exec=id help"`, those become three separate argv
> entries. The server is running as the user who launched it. I just
> need to find a command where an injected flag does something useful.

**Remediation:** Replace the whitespace-split argv with a structured
argv template. Change the exec handler spec from a single string to an
array of strings, each rendered independently:

```yaml
handler:
  exec: ["git", "log", "--oneline", "{{count}}"]
```

Each rendered element becomes one argv entry regardless of content,
eliminating the class of vulnerability entirely.

<div>&hairsp;</div>

### Dispatch case when: guards not evaluated under task-tool fusion

**moderate** · `src/runtime/handlers/dispatch.ts:22-25` · effort: small · <img src="assets/sparkline-when-guards-skipped-in-task-dispatch-fusion.svg" height="14" alt="commit activity" />

When a dispatch tool has `execution.taskSupport`, the boot integration
calls `resolveDispatchCase()` which matches on the discriminator and
checks `requires:`, but does NOT evaluate `when:` guards. Guard
evaluation only happens in the synchronous `invokeDispatch()` path. A
dispatch case with both a `when:` guard and a `workflow:` handler
bypasses the guard entirely under task-tool fusion.

```typescript src/runtime/handlers/dispatch.ts:22-25
export function resolveDispatchCase(
  handler: DispatchHandler,
  args: Record<string, unknown>,
): ResolveDispatchResult {
```

**Remediation:** Evaluate `when:` guards in the task-dispatch fusion
path before branching on handler type, or add a parse-time warning when
a dispatch case has both `when:` and a `workflow:` handler inside a
task tool.

<div>&hairsp;</div>

### Tool entries do not reject unknown keys unlike every other config block

**moderate** · `src/runtime/config.ts:547-579` · effort: trivial · <img src="assets/sparkline-tool-unknown-keys-not-rejected.svg" height="14" alt="commit activity" />

Every other config block (connections, probes, resources, prompts,
completions, workflows, states, transitions, security) rejects unknown
keys with a clear error. Tool entries are the sole exception. A YAML
author who writes `gaurd:` instead of `guard:` gets silent acceptance.

**Remediation:** Add the same unknown-key check pattern. Define a
`TOOL_KNOWN` set containing the six valid keys and iterate
`Object.keys(t)` to reject unknowns.

<div>&hairsp;</div>

### InputFieldSchema.type accepts any string at parse time

**moderate** · `src/runtime/config.ts:621-626` · effort: trivial · <img src="assets/sparkline-input-type-not-validated.svg" height="14" alt="commit activity" />

The TypeScript type restricts `InputFieldSchema.type` to six values, but
the runtime validator only checks `typeof` — any string passes. A YAML
author writing `type: strinng` gets no parse-time error. The invalid
type flows into JSON Schema sent to the SDK.

```typescript src/runtime/config.ts:621-626
      const s = schema as Record<string, unknown>;
      if (typeof s["type"] !== "string") {
        throw new Error(`config: tools[${toolName}].input.${field}.type is required`);
      }
      out[field] = {
        type: s["type"] as InputFieldSchema["type"],
```

**Remediation:** Add a `validTypes` Set with the six allowed values and
check membership before the cast.

<div>&hairsp;</div>

### Duplicate tool names silently accepted by config parser

**moderate** · `src/runtime/config.ts:539-545` · effort: trivial · <img src="assets/sparkline-tool-name-uniqueness-not-enforced.svg" height="14" alt="commit activity" />

The prompts validator tracks `seenNames` and rejects duplicates. The
resources validator tracks seen URIs. The tool validator does neither.
When two tools share a name, `McpServer.registerTool` silently
overwrites the first.

**Remediation:** Add a `seenNames` Set to `validateTools` matching the
pattern in `validatePrompts`.

*Verdict: The exec handler's whitespace-split argument construction is
the most consequential finding in this audit. The four config validation
gaps are defense-in-depth issues that erode the "typos fail loud"
principle enforced everywhere else — straightforward additions following
existing patterns.*

<div>&nbsp;</div>

---

## The Error Propagation Surface

*The workflow subsystem's error handling has one crash path, one uncovered
try-catch gap, and two silent-discard patterns that contrast sharply with
the clean error propagation in the synchronous handler path.*

### interpretWorkflow launched as fire-and-forget with no .catch() handler

**significant** · `src/runtime/index.ts:197-211` · effort: trivial · <img src="assets/sparkline-workflow-fire-and-forget-unhandled-rejection.svg" height="14" alt="commit activity" />

`startWorkflowTask` launches `interpretWorkflow` as a detached promise
via `void`. Inside `interpretWorkflow`, the terminal-state path calls
`await store.storeTaskResult()` without a try-catch. If the store throws,
the rejection becomes unhandled. Under Node.js default behavior
(`--unhandled-rejections=throw`), this crashes the process.

```typescript src/runtime/index.ts:197-211
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

Enabled by [response.text() outside try-catch](#fetch-response-body-read-uncaught).

**Remediation:** Attach a `.catch()` handler to the `interpretWorkflow`
call, or wrap `store.storeTaskResult` in try-catch matching the pattern
already used for action errors at tasks.ts:603-611.

<div>&hairsp;</div>

### response.text() outside try-catch can throw on stream failure

**moderate** · `src/runtime/util/fetch.ts:57-73` · effort: trivial · <img src="assets/sparkline-fetch-response-body-read-uncaught.svg" height="14" alt="commit activity" />

The try-catch covers only the `fetch()` call. The subsequent
`response.text()` reads the body stream and can throw if the connection
resets mid-transfer or the AbortSignal fires during the body read. This
exception propagates through the handler chain, and for workflow actions
it feeds into the fire-and-forget crash path.

```typescript src/runtime/util/fetch.ts:57-73
let response: Response;
try {
  response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal,
  });
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (signal.aborted) {
    return errorResult(`http: timeout after ${timeout}ms`);
  }
  return errorResult(`http: ${msg}`);
}

const bodyText = await response.text();
```

Enables [workflow fire-and-forget crash](#workflow-fire-and-forget-unhandled-rejection).

**Remediation:** Extend the try-catch to cover `response.text()`, or
add a second try-catch around line 73.

<div>&hairsp;</div>

### pickTransition silently swallows JSONLogic errors in when: guards

**moderate** · `src/runtime/tasks.ts:669-684` · effort: trivial · <img src="assets/sparkline-workflow-transition-silent-catch.svg" height="14" alt="commit activity" />

When a JSONLogic `when:` guard throws, the exception is caught and
silently discarded via `continue`. If all transitions error, the
workflow reports "no transition matched" with no indication the problem
is a broken guard. Compare to `dispatch.ts` which explicitly catches and
reports guard errors.

```typescript src/runtime/tasks.ts:669-684
async function pickTransition(
  transitions: TransitionSpec[],
  workflowCtx: Record<string, unknown>,
): Promise<TransitionSpec | undefined> {
  for (const t of transitions) {
    if (t.when === undefined) return t;
    let matched: unknown;
    try {
      matched = await evalJsonLogic(t.when as JsonLogicRule, workflowCtx);
    } catch {
      continue;
    }
    if (matched) return t;
  }
  return undefined;
}
```

**Remediation:** Log guard evaluation errors to stderr before
continuing, preserving the skip-and-try-next semantics while making
failure visible.

<div>&hairsp;</div>

### getTaskResult casts potentially null store return to CallToolResult

**advisory** · `src/runtime/index.ts:175-177` · effort: trivial · <img src="assets/sparkline-get-task-result-null-cast.svg" height="14" alt="commit activity" />

The `as CallToolResult` cast silences TypeScript but does not prevent
null from reaching SDK serialization. Compare to `getTask` one line
above which correctly guards with `if (!t) throw new Error(...)`.

**Remediation:** Add a null check before the cast, matching the pattern
in `getTask`.

<div>&hairsp;</div>

### Task status updates fire-and-forget with errors swallowed

**advisory** · `src/runtime/tasks.ts:566-570` · effort: trivial · <img src="assets/sparkline-status-update-fire-and-forget.svg" height="14" alt="commit activity" />

Every state transition pushes a status update, but failures are silently
swallowed. If the store is persistently broken, the workflow continues
with zero visibility into the problem.

**Remediation:** Log failures to stderr in the `.catch()` body.

*Verdict: The synchronous tool dispatch path has solid error handling.
The async workflow path is where errors fall through — the fire-and-forget
launch creates a real crash risk, and the silent catch in pickTransition
makes config errors invisible. These cluster in the newest code (Plans
8-9) and the hardening step is next.*

<div>&nbsp;</div>

---

## The Config Schema Surface

*The config validator is thorough — unknown keys are rejected, types are
checked, cross-references are validated — but it lacks a version
evolution strategy and has consistency gaps at the edges.*

### YAML config schema has no version field or forward-compatibility strategy

**significant** · `src/runtime/config.ts:318-332` · effort: small · <img src="assets/sparkline-no-schema-evolution-strategy.svg" height="14" alt="commit activity" />

The YAML config is the primary user-facing API, but it carries no
version indicator. The parser accepts whatever YAML it receives. When a
future version changes semantics, there is no mechanism to distinguish
v1 from v2. Kubernetes `apiVersion` and Docker Compose `version` are
instructive precedents.

**Remediation:** Add an optional `version:` field. The v1 parser accepts
configs with `version: "1"` or no version. Future versions require the
field and branch on it.

<div>&hairsp;</div>

### http and graphql handlers use different names for the non-envelope response mode

**moderate** · `src/runtime/config.ts:81` · effort: small · <img src="assets/sparkline-response-mode-synonym.svg" height="14" alt="commit activity" />

The http handler's response mode is `"body" | "envelope"` while graphql
is `"data" | "envelope"`. Both control the same concept — a YAML author
must remember which synonym applies to which handler.

**Remediation:** Unify to `"body"`. Accept `"data"` as a deprecated
alias in graphql for one release cycle.

<div>&hairsp;</div>

### Probe http/graphql handlers skip structural validation at parse time

**advisory** · `src/runtime/probes.ts:76-88` · effort: small · <img src="assets/sparkline-probe-handler-not-deep-validated.svg" height="14" alt="commit activity" />

Probe handler blocks are cast to their types without running through
`validateGraphql`/`validateHttp`. A malformed probe handler only fails at
boot with a generic error instead of a parse-time path-specific message.

**Remediation:** Call the existing `validateHandler` public function on
probe handler entries.

<div>&hairsp;</div>

### validateSecurity repeats identical allow-array validation three times

**advisory** · `src/runtime/config.ts:476-534` · effort: small · <img src="assets/sparkline-security-validation-copy-paste.svg" height="14" alt="commit activity" />

Three structurally identical 18-line blocks differ only in key name and
error prefix. All three subsystems share the same shape.

**Remediation:** Extract `validateSecurityBlock(sec, key, path)` that
validates once, parameterized on key name.

*Verdict: The hand-rolled validator is one of the codebase's strengths.
Adding a version field now, while the alpha user base is zero, costs
nothing and prevents a class of future migration pain.*

<div>&nbsp;</div>

---

## The Network Boundary Surface

*The HTTP/exec boundary has proper host allowlisting and timeout
enforcement, but the response handling lacks size limits and the default
env allowlist is more permissive than necessary.*

### HTTP response body read into memory without size limit

**moderate** · `src/runtime/util/fetch.ts:73` · effort: small · <img src="assets/sparkline-unbounded-http-response-body.svg" height="14" alt="commit activity" />

Every HTTP and GraphQL handler funnels through `performFetch`, which
calls `response.text()` with no size cap. Unlike `execFile` (which has a
default ~1 MB maxBuffer), `fetch`'s `response.text()` will consume all
available heap. In a long-running stdio server, this is the only path
where external input can cause unbounded memory growth.

> The server stays resident between requests. If I can make it call
> an endpoint I control, I return a 2 GB response. One request, one OOM.

**Remediation:** Read the response in a streaming fashion with a
configurable `max_response_bytes` limit (e.g., 10 MB default). Abort
and return an `isError` result if exceeded.

<div>&hairsp;</div>

### Default env allowlist includes PATH, leaking filesystem layout to JSONLogic

**advisory** · `src/runtime/util/access.ts:27-35` · effort: trivial · <img src="assets/sparkline-default-env-allowlist-exposes-path.svg" height="14" alt="commit activity" />

When a YAML config omits `security.env.allow`, the default includes
PATH, HOME, and USER — accessible via `env.get` JSONLogic helpers. PATH
reveals installed software and filesystem structure.

**Remediation:** Remove PATH from `DEFAULT_ENV_ALLOW`. Authors who need
it can opt in explicitly.

<div>&hairsp;</div>

### JSONLogic connection headers re-evaluated on every request

**advisory** · `src/runtime/connections.ts:59-72` · effort: small · <img src="assets/sparkline-connection-headers-re-evaluated-per-request.svg" height="14" alt="commit activity" />

`resolveHeaders` is called on every HTTP/GraphQL invocation. For
connections with `env.get`-based JSONLogic rules (the common Bearer
token pattern), this re-runs the async engine per request against an
empty context. The result is always the same for the process lifetime.

**Remediation:** Cache resolved header values after first evaluation.
Add `cache_headers: false` escape hatch for time-varying rules.

<div>&hairsp;</div>

### exec handler relies on Node.js default maxBuffer for stdout

**note** · `src/runtime/handlers/exec.ts:37` · effort: trivial · <img src="assets/sparkline-exec-stdout-default-maxbuffer.svg" height="14" alt="commit activity" />

`execFileAsync` uses Node.js's default ~1 MB maxBuffer. This is actually
a reasonable implicit bound, but it's invisible to YAML authors.

**Remediation:** Consider exposing an optional `max_output_bytes` field.
At minimum, document the implicit limit.

*Verdict: The allowlist architecture is sound. The response side is where
gaps appear — `response.text()` reads unbounded bodies, and the default
env allowlist includes PATH without requiring opt-in.*

<div>&nbsp;</div>

---

## The Code Maintenance Surface

*Handler modules have accumulated three families of duplicated helpers
during rapid 4-day development, and the SDK adapter layer has no unit
tests.*

### Identical stringify() helper duplicated across three modules

**moderate** · `src/runtime/handlers/compute.ts:41-46` · effort: trivial · <img src="assets/sparkline-triplicate-stringify.svg" height="14" alt="commit activity" />

Three modules contain character-identical copies of a `stringify(value:
unknown): string` helper. A fourth variant in `util/template.ts` differs
only in null/undefined handling. Any behavior change must be applied in
three places independently.

**Remediation:** Extract shared `stringify` into `util/stringify.ts`.

<div>&hairsp;</div>

### Identical renderJsonLeaves() duplicated between http.ts and graphql.ts

**moderate** · `src/runtime/handlers/http.ts:107-118` · effort: trivial · <img src="assets/sparkline-duplicate-render-json-leaves.svg" height="14" alt="commit activity" />

Both private copies recursively walk a value tree and Mustache-render
string leaves. A fix in one must be manually replicated.

**Remediation:** Move to `util/template.ts` alongside the existing
`render` function.

<div>&hairsp;</div>

### server.ts SDK adapter (589 LOC) has no unit tests

**moderate** · `src/runtime/server.ts:319-589` · effort: medium · <img src="assets/sparkline-no-unit-tests-server-adapter.svg" height="14" alt="commit activity" />

`server.ts` is the SDK quarantine boundary. Coverage is entirely through
integration tests which spawn the full runtime. Regressions in the
adapter — no-schema branch of `registerTool`, prompt-args-schema
bridging, completions handler — require process spawning to detect. The
SDK alpha may shift underneath.

**Remediation:** Add `tests/server.test.ts` exercising `JigServerHandle`
methods at the function level.

<div>&hairsp;</div>

### Behaviorally identical errorResult() helper duplicated across five handler modules

**advisory** · `src/runtime/handlers/exec.ts:44-49` · effort: trivial · <img src="assets/sparkline-duplicate-error-result.svg" height="14" alt="commit activity" />

Five handler-adjacent modules define private `errorResult` helpers with
identical behavior but two formatting variants. Five copies means a
shape change requires five coordinated edits.

**Remediation:** Export shared `errorResult` from `handlers/types.ts`.

<div>&hairsp;</div>

### getEngine() exports mutable engine handle from utility module

**advisory** · `src/runtime/util/jsonlogic.ts:51-53` · effort: trivial · <img src="assets/sparkline-getengine-exported-from-util.svg" height="14" alt="commit activity" />

`getEngine()` returns the singleton `AsyncLogicEngine` with full
mutation surface. The JSDoc says "Not exported" but it IS exported. Only
`helpers.ts` consumes it.

**Remediation:** Remove the `export` keyword.

<div>&hairsp;</div>

### handlers/inline.ts re-exports ToolCallResult but no consumer imports it

**note** · `src/runtime/handlers/inline.ts:4` · effort: trivial · <img src="assets/sparkline-dead-re-export-inline.svg" height="14" alt="commit activity" />

Vestigial re-export from early development. Can confuse IDE auto-import.

**Remediation:** Remove the `export type { ToolCallResult }` line.

*Verdict: The duplication is normal for rapid development. The three
consolidation targets (stringify, renderJsonLeaves, errorResult) have
clear extraction points. The server.ts unit test gap is the most
consequential item here.*

<div>&nbsp;</div>

---

## The Completeness Surface

*The runtime delivers all 10 planned capabilities (Plans 1-9), but the
project has no user-facing documentation and the designed CLI surface
does not exist yet.*

### No README or user-facing documentation exists

**significant** · `package.json:1-5` · effort: small · <img src="assets/sparkline-no-user-facing-documentation.svg" height="14" alt="commit activity" />

No README.md, no docs/ directory, no CONTRIBUTING.md. A developer
discovering this project sees only the one-line package.json description.
The 10 example YAML files have good inline comments, but there is no
document explaining how to run the runtime or what YAML schema fields
exist. The content already exists across design docs and example
comments — it needs assembly.

**Remediation:** Add a README.md covering: what jig is, how to run it,
the YAML schema sections, handler types, and links to examples.

<div>&hairsp;</div>

### Documented CLI commands (jig new/dev/validate/build) do not exist

**advisory** · `record/designs/2026-04-13-jig-design.md:49-56` · effort: large · <img src="assets/sparkline-cli-surface-not-implemented.svg" height="14" alt="commit activity" />

The design document describes six CLI commands. None exist — no
`src/cli/`, no `bin` entry. The handoff explicitly acknowledges: "No CLI
exists yet — Plan 10 builds it."

**Remediation:** Implement Plan 10. Ensure interim documentation
describes the current invocation method.

<div>&hairsp;</div>

### Only stdio transport implemented; HTTP transport described in design is absent

**note** · `src/runtime/transports/stdio.ts:1-17` · effort: medium · <img src="assets/sparkline-stdio-only-transport.svg" height="14" alt="commit activity" />

The design lists `transports/http.ts`. Only stdio exists. This is
correct for v1's use case (local MCP servers as subprocesses).

**Remediation:** Add Streamable HTTP transport when remote use cases
arise. The server.ts adapter already accepts a Transport interface.

<div>&hairsp;</div>

### Server advertises tools.listChanged capability but never fires the notification

**note** · `src/runtime/server.ts:333-337` · effort: trivial · <img src="assets/sparkline-tools-list-changed-advertised-never-fired.svg" height="14" alt="commit activity" />

Pre-declared for future hot-reload. A well-behaved client won't break,
but it is a minor capability overstatement.

**Remediation:** Remove until hot-reload lands, or leave as-is — the
comment documents the intent.

*Verdict: For a 4-day-old alpha, runtime completeness is impressive. The
gaps are all about packaging, not functionality. The documentation gap
is the most impactful because it blocks discoverability.*

<div>&nbsp;</div>

---

## The Supply Chain Surface

*The dependency tree is minimal and advisory-free — four production
dependencies, all actively maintained, with zero npm audit findings.*

### @modelcontextprotocol/server pinned to exact alpha pre-release

**advisory** · `package.json:16` · effort: trivial · <img src="assets/sparkline-mcp-server-pinned-alpha.svg" height="14" alt="commit activity" />

The MCP server SDK is pinned to exact version `2.0.0-alpha.2`. Only two
alpha releases exist. The pin is defensible — alpha APIs carry inherent
breakage risk — but it creates a manual update burden as the SDK iterates
toward stability.

**Remediation:** No immediate action. When a stable 2.0.0 ships, switch
to `^2.0.0`.

*Verdict: This is one of the cleanest dependency profiles possible. The
supply chain is not a concern area for this audit.*

<div>&nbsp;</div>

---

## Remediation Ledger

**The Tool Dispatch Boundary**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [exec-arg-injection-via-whitespace-split](#argument-injection-in-exec-handler-via-whitespace-splitting-of-template-rendered-command) | significant | `exec.ts:27-28` | medium | |
| [when-guards-skipped-in-task-dispatch-fusion](#dispatch-case-when-guards-not-evaluated-under-task-tool-fusion) | moderate | `dispatch.ts:22-25` | small | |
| [tool-unknown-keys-not-rejected](#tool-entries-do-not-reject-unknown-keys-unlike-every-other-config-block) | moderate | `config.ts:547-579` | trivial | |
| [input-type-not-validated](#inputfieldschematype-accepts-any-string-at-parse-time) | moderate | `config.ts:621-626` | trivial | |
| [tool-name-uniqueness-not-enforced](#duplicate-tool-names-silently-accepted-by-config-parser) | moderate | `config.ts:539-545` | trivial | |

**The Error Propagation Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [workflow-fire-and-forget-unhandled-rejection](#interpretworkflow-launched-as-fire-and-forget-with-no-catch-handler) | significant | `index.ts:197-211` | trivial | enabled by: fetch-response-body-read-uncaught |
| [fetch-response-body-read-uncaught](#responsetext-outside-try-catch-can-throw-on-stream-failure) | moderate | `fetch.ts:57-73` | trivial | enables: workflow-fire-and-forget |
| [workflow-transition-silent-catch](#picktransition-silently-swallows-jsonlogic-errors-in-when-guards) | moderate | `tasks.ts:669-684` | trivial | |
| [get-task-result-null-cast](#gettaskresult-casts-potentially-null-store-return-to-calltoolresult) | advisory | `index.ts:175-177` | trivial | |
| [status-update-fire-and-forget](#task-status-updates-fire-and-forget-with-errors-swallowed) | advisory | `tasks.ts:566-570` | trivial | |

**The Config Schema Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [no-schema-evolution-strategy](#yaml-config-schema-has-no-version-field-or-forward-compatibility-strategy) | significant | `config.ts:318-332` | small | |
| [response-mode-synonym](#http-and-graphql-handlers-use-different-names-for-the-non-envelope-response-mode) | moderate | `config.ts:81` | small | |
| [probe-handler-not-deep-validated](#probe-httpgraphql-handlers-skip-structural-validation-at-parse-time) | advisory | `probes.ts:76-88` | small | |
| [security-validation-copy-paste](#validatesecurity-repeats-identical-allow-array-validation-three-times) | advisory | `config.ts:476-534` | small | |

**The Network Boundary Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [unbounded-http-response-body](#http-response-body-read-into-memory-without-size-limit) | moderate | `fetch.ts:73` | small | |
| [default-env-allowlist-exposes-path](#default-env-allowlist-includes-path-leaking-filesystem-layout-to-jsonlogic) | advisory | `access.ts:27-35` | trivial | |
| [connection-headers-re-evaluated-per-request](#jsonlogic-connection-headers-re-evaluated-on-every-request) | advisory | `connections.ts:59-72` | small | |
| [exec-stdout-default-maxbuffer](#exec-handler-relies-on-nodejs-default-maxbuffer-for-stdout) | note | `exec.ts:37` | trivial | |

**The Code Maintenance Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [triplicate-stringify](#identical-stringify-helper-duplicated-across-three-modules) | moderate | `compute.ts:41-46` | trivial | |
| [duplicate-render-json-leaves](#identical-renderjsonleaves-duplicated-between-httpts-and-graphqlts) | moderate | `http.ts:107-118` | trivial | |
| [no-unit-tests-server-adapter](#serverts-sdk-adapter-589-loc-has-no-unit-tests) | moderate | `server.ts:319-589` | medium | |
| [duplicate-error-result](#behaviorally-identical-errorresult-helper-duplicated-across-five-handler-modules) | advisory | `exec.ts:44-49` | trivial | |
| [getengine-exported-from-util](#getengine-exports-mutable-engine-handle-from-utility-module) | advisory | `jsonlogic.ts:51-53` | trivial | |
| [dead-re-export-inline](#handlersinlinets-re-exports-toolcallresult-but-no-consumer-imports-it) | note | `inline.ts:4` | trivial | |

**The Completeness Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [no-user-facing-documentation](#no-readme-or-user-facing-documentation-exists) | significant | `package.json:1-5` | small | |
| [cli-surface-not-implemented](#documented-cli-commands-jig-newdevvalidatebuild-do-not-exist) | advisory | `design.md:49-56` | large | |
| [stdio-only-transport](#only-stdio-transport-implemented-http-transport-described-in-design-is-absent) | note | `stdio.ts:1-17` | medium | |
| [tools-list-changed-advertised-never-fired](#server-advertises-toolslistchanged-capability-but-never-fires-the-notification) | note | `server.ts:333-337` | trivial | |

**The Supply Chain Surface**

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| [mcp-server-pinned-alpha](#modelcontextprotocolserver-pinned-to-exact-alpha-pre-release) | advisory | `package.json:16` | trivial | |

---

<sub>
Generated 2026-04-18 at commit d825be65.
Intermediate artifacts: recon.yaml, findings.yaml, report.html.
</sub>
