---
audit_date: 2026-04-21
project: jig
commit: 000653b1d5418a7fb42460d1225601edbda4ec9f
scope: Full repo audit — src/runtime, src/cli, examples, and tests
auditor: Codex (GPT-5.4, high effort)
findings:
  critical: 0
  significant: 7
  moderate: 5
  advisory: 0
  note: 0
---

# Audit: jig

This audit covered the current `jig` runtime, CLI, examples, and tests at
`000653b1d5418a7fb42460d1225601edbda4ec9f`. The project still has a strong
core shape: small dependency tree, extensive tests, explicit config
validation, and clean boundaries around most runtime subsystems. **The
Command Execution Surface** and **The HTTP Surface** now carry the highest
risk because they expose directly reachable trust-boundary mistakes from MCP
client input and browser-adjacent localhost traffic. **The Workflow Failure
Surface**, **The Runtime Maintainability Surface**, **The CLI Contract
Surface**, and **The Documentation Parity Surface** are less dangerous but
show a consistent theme: the product surface expanded faster than the error,
contract, and docs layers around it. Fix the exec argv split and the
loopback HTTP transport first; the rest is contract repair and surface
tightening.

## The Command Execution Surface

*The command-execution boundary is still exploitable because string-form exec
handlers turn rendered user input into extra argv entries.*

### exec-string-argv-injection

**String-form exec handlers split rendered text into extra argv elements**

**significant** · `src/runtime/handlers/exec.ts:40-57` · effort: medium ·
<img src="assets/sparkline-exec-string-argv-injection.svg" height="14" alt="commit activity" />

The array form of `exec` is fine. The string form is not. A client controls
tool-call arguments, those values are rendered into the configured command
template, and the result is then tokenized with `split(/\s+/)`. That means a
single attacker-controlled value containing spaces becomes multiple argv
entries at the `execFile` sink. This is not shell injection, but it is still
reachable argument injection against the configured binary.

```typescript src/runtime/handlers/exec.ts:40-57
if (Array.isArray(handler.exec)) {
  argv = handler.exec.map((part) => render(part, templateCtx));
  if (argv.length === 0) {
    return errorResult("exec: empty command array");
  }
} else {
  const rendered = render(handler.exec, templateCtx);
  argv = rendered.trim().split(/\s+/).filter((part) => part.length > 0);
  if (argv.length === 0) {
    return errorResult(`exec: empty command after template render: "${handler.exec}"`);
  }
}

const [command, ...commandArgs] = argv;

try {
  const maxBuffer = handler.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const { stdout } = await execFileAsync(command!, commandArgs, { maxBuffer });
```

> I do not need shell metacharacters here. I just need one value with spaces in
> it so your template renderer manufactures the extra flags for me.

Related: [handler-parsing-is-order-dependent](#handler-parsing-is-order-dependent).

**Remediation:** retire the string form of `exec` and require an explicit argv
array. Render each array element independently and pass the resulting array
straight to `execFile`. If compatibility requires the string form to survive,
make it fail closed rather than tokenizing rendered output.

*Verdict: the command boundary is not broadly broken, but one compatibility
path remains unsafe enough to deserve near-term removal or hardening.*

<div>&nbsp;</div>

## The HTTP Surface

*The HTTP surface trusts too much of the request target: outbound handlers let
callers reshape paths, and the new inbound loopback transport has no
browser-facing gate beyond path matching.*

### http-path-template-traversal

**HTTP path templates are concatenated without segment encoding**

**moderate** · `src/runtime/handlers/http.ts:47-59` · effort: small ·
<img src="assets/sparkline-http-path-template-traversal.svg" height="14" alt="commit activity" />

The host allowlist stops outright SSRF to arbitrary hosts, but it does not
stop a caller from reshaping the path within an allowed host. Interpolated
path values are appended raw to `baseUrl`, while query values are properly
encoded via `URLSearchParams`. That asymmetry means a narrow template like
`/items/{{id}}` can be widened by a caller into `/items/../admin?foo=bar`.

```typescript src/runtime/handlers/http.ts:47-59
// Step 2 — render path + query + header values
const pathRendered = spec.path !== undefined ? render(spec.path, renderCtx) : "";
let fullUrl = baseUrl + pathRendered;
if (spec.query !== undefined) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(spec.query)) {
    params.append(k, render(v, renderCtx));
  }
  const qs = params.toString();
  if (qs.length > 0) {
    fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
  }
}
```

> You already gave me the host. I only need the path. If I can inject `/`,
> `..`, or `?`, I get to choose which endpoint on that host you really hit.

**Remediation:** treat interpolated path values as path segments, not raw path
text. Encode each interpolated segment with `encodeURIComponent`, and reject
slash-bearing or query-bearing values where a single segment is expected.

### http-transport-dns-rebinding

**Loopback HTTP transport is exposed without rebinding or origin checks**

**significant** · `src/runtime/transports/http.ts:36-55` · effort: medium ·
<img src="assets/sparkline-http-transport-dns-rebinding.svg" height="14" alt="commit activity" />

The new HTTP transport binds to loopback, but it does not add any second gate
for browser traffic. The transport is constructed with a session ID generator
only, then every request on the configured path is converted into a web request
and handed to the MCP transport. That is not enough protection for a localhost
HTTP service in 2026, because browsers and rebinding attacks treat loopback as
reachable infrastructure.

```typescript src/runtime/transports/http.ts:36-55
const mcpPath = options.path ?? "/mcp";
const hostname = options.hostname ?? "127.0.0.1";

const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: options.sessionIdGenerator ?? (() => crypto.randomUUID()),
});

const httpServer = createHttpServer(async (req, res) => {
  // Only serve the MCP endpoint path.
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== mcpPath) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  try {
    const webRequest = nodeToWebRequest(req, url);
    const webResponse = await transport.handleRequest(webRequest);
    await writeWebResponse(webResponse, res);
```

> Localhost is still a network surface. If I can get a browser to talk to it,
> I do not care that you bound to `127.0.0.1`.

Related: [build-port-flag-is-ignored](#build-port-flag-is-ignored).

**Remediation:** plumb explicit host and origin checks into the transport
constructor, and reject requests whose `Host` or `Origin` are not on an
allowlist. If browser access must stay supported, put an explicit auth gate in
front of the MCP session handshake.

*Verdict: the host allowlist work helped the outbound side, but the HTTP story
is not complete until path encoding and localhost transport hardening are in
place.*

<div>&nbsp;</div>

## The Workflow Failure Surface

*Workflow failures are usually detected, but two branches still hide the real
cause from the task result surface that clients depend on.*

### task-result-write-failures-swallowed

**Failed task results are dropped when the store rejects**

**moderate** · `src/runtime/tasks.ts:737-750` · effort: small ·
<img src="assets/sparkline-task-result-write-failures-swallowed.svg" height="14" alt="commit activity" />

`safeFail()` is the shared terminal path for workflow failures. If the task
store rejects the final write, the empty catch swallows both the original
workflow failure and the persistence failure. That turns a task-store problem
into silent disappearance of the terminal state.

```typescript src/runtime/tasks.ts:737-750
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

**Remediation:** log and propagate rejected terminal writes instead of
discarding them. Add a regression test that forces `storeTaskResult()` to
reject and asserts the failure remains visible to an operator or caller.

Related: [workflow-interpreter-is-too-dense](#workflow-interpreter-is-too-dense).

### transition-guard-errors-collapse-to-generic-stall

**Transition guard exceptions become a generic stalled-workflow result**

**moderate** · `src/runtime/tasks.ts:669-688` · effort: small ·
<img src="assets/sparkline-transition-guard-errors-collapse-to-generic-stall.svg" height="14" alt="commit activity" />

When a `when:` guard throws, `pickTransition()` logs the exception and keeps
searching for another transition. If none match, the caller only sees the
generic stalled-workflow path. That strips the actual guard failure out of the
task result even though the thrown guard is the real reason the workflow could
not advance.

```typescript src/runtime/tasks.ts:669-688
async function pickTransition(
  transitions: TransitionSpec[],
  workflowCtx: Record<string, unknown>,
): Promise<TransitionSpec | undefined> {
  for (const t of transitions) {
    if (t.when === undefined) return t;
    let matched: unknown;
    try {
      matched = await evalJsonLogic(t.when as JsonLogicRule, workflowCtx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `jig: when: guard error (skipping transition to "${t.target}"): ${msg}\n`,
      );
      continue;
    }
    if (matched) return t;
  }
  return undefined;
}
```

**Remediation:** promote thrown guard errors into the task result instead of
collapsing them into a generic stall. Either fail immediately on the first
thrown guard or retain the first thrown error and include it in the terminal
result when all transitions fail.

Related: [workflow-interpreter-is-too-dense](#workflow-interpreter-is-too-dense).

*Verdict: the workflow subsystem mostly fails loud, but not yet consistently.
Both findings are local fixes that would materially improve operator-facing
diagnostics.*

<div>&nbsp;</div>

## The Runtime Maintainability Surface

*The parser and workflow core are starting to encode behavior in control-flow
accidents instead of explicit contracts.*

### handler-parsing-is-order-dependent

**Handler parsing is order-dependent and can accept mixed shapes**

**significant** · `src/runtime/config.ts:658-736` · effort: small ·
<img src="assets/sparkline-handler-parsing-is-order-dependent.svg" height="14" alt="commit activity" />

`validateHandler()` is behaving like a first-match dispatcher, not a true
union validator. If a malformed handler object carries multiple shapes, the
first matching branch wins and the rest of the object is silently ignored.
That makes branch order part of the contract and turns future handler growth
into a compatibility hazard.

```typescript src/runtime/config.ts:658-736
function validateHandler(v: unknown, toolName: string): Handler {
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].handler must be a mapping`);
  }
  const h = v as Record<string, unknown>;

  if (h["inline"] && typeof h["inline"] === "object") {
    const inline = h["inline"] as Record<string, unknown>;
    if (typeof inline["text"] !== "string") {
      throw new Error(
        `config: tools[${toolName}].handler.inline.text must be a string`,
      );
    }
    return { inline: { text: inline["text"] } };
  }

  if (typeof h["exec"] === "string" || Array.isArray(h["exec"])) {
    let exec: string | string[];
    if (typeof h["exec"] === "string") {
      if (h["exec"].length === 0) {
        throw new Error(
          `config: tools[${toolName}].handler.exec must be a non-empty string`,
        );
      }
      exec = h["exec"];
    } else {
      const arr = h["exec"] as unknown[];
      if (arr.length === 0) {
        throw new Error(
          `config: tools[${toolName}].handler.exec array must not be empty`,
        );
      }
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== "string") {
          throw new Error(
            `config: tools[${toolName}].handler.exec[${i}] must be a string`,
          );
        }
      }
      exec = arr as string[];
    }
    const result: ExecHandler = { exec };
    if (h["max_output_bytes"] !== undefined) {
      if (typeof h["max_output_bytes"] !== "number" || !Number.isFinite(h["max_output_bytes"]) || h["max_output_bytes"] <= 0) {
        throw new Error(
          `config: tools[${toolName}].handler.max_output_bytes must be a positive number`,
        );
      }
      result.max_output_bytes = h["max_output_bytes"];
    }
    return result;
  }

  if (h["dispatch"] && typeof h["dispatch"] === "object") {
    return validateDispatch(h["dispatch"], toolName);
  }

  if ("compute" in h) {
    // JSONLogic rules are arbitrary JSON; we do no structural validation
    // at parse time. Unknown operators surface at invoke time as isError
    // tool results, not as config errors.
    return { compute: h["compute"] };
  }

  if (h["http"] && typeof h["http"] === "object") {
    return validateHttp(h["http"], toolName);
  }

  if (h["graphql"] && typeof h["graphql"] === "object") {
    return validateGraphql(h["graphql"], toolName);
  }

  if (h["workflow"] && typeof h["workflow"] === "object") {
    return validateWorkflowHandler(h["workflow"], toolName);
  }

  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (inline, exec, dispatch, compute, http, graphql, workflow)`,
  );
}
```

**Remediation:** collect the present handler keys first, require exactly one
recognized shape, reject extras, and only then dispatch to the subtype
validator. That makes the handler union explicit instead of implicit in
statement order.

Related: [exec-string-argv-injection](#exec-string-argv-injection).

### workflow-interpreter-is-too-dense

**Workflow interpretation is too dense to change safely**

**significant** · `src/runtime/tasks.ts:534-667` · effort: medium ·
<img src="assets/sparkline-workflow-interpreter-is-too-dense.svg" height="14" alt="commit activity" />

`interpretWorkflow()` currently owns status updates, elicitation, action
execution, terminal rendering, transition selection, and loop detection inside
one function. The code is still understandable with effort, but it has crossed
the threshold where each new feature has to be threaded through many early
returns and failure exits. That is how local workflow fixes become risky.

```typescript src/runtime/tasks.ts:534-667
export async function interpretWorkflow(
  opts: InterpretWorkflowOptions,
): Promise<void> {
  const { workflow, args, ctx, store, taskId, invoke, elicit } = opts;
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

  let current = workflow.initial;
  const MAX_STEPS = 1024;
  let steps = 0;

  while (steps++ < MAX_STEPS) {
    const state = workflow.states[current];
    if (!state) {
      await safeFail(
        store,
        taskId,
        `interpreter: state "${current}" not declared (this is a jig bug — should have been caught at parse time)`,
      );
      return;
    }

    void store
      .updateTaskStatus(taskId, state.mcpStatus, state.statusMessage)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`jig: status update failed for task ${taskId}: ${msg}\n`);
      });

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
      // Bind response: action is always present; content fields spread in.
      workflowCtx.elicitation = {
        action: elicitResult.action,
        ...(elicitResult.content ?? {}),
      };
      // Fall through to transition evaluation (no actions on input_required states).
    }

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
      await safeFail(
        store,
        taskId,
        `interpreter: state "${current}" is non-terminal but has no on: transitions`,
      );
      return;
    }

    const next = await pickTransition(state.on, workflowCtx);
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
```

**Remediation:** split the interpreter into phase helpers and keep the
top-level loop as orchestration only. Status updates, elicitation, action
execution, transition resolution, and terminal rendering should each have one
place to change.

Related: [task-result-write-failures-swallowed](#task-result-write-failures-swallowed),
[transition-guard-errors-collapse-to-generic-stall](#transition-guard-errors-collapse-to-generic-stall).

*Verdict: the runtime architecture is still disciplined overall, but these two
modules are where future feature work is most likely to create accidental
behavior changes if the code is left in its current shape.*

<div>&nbsp;</div>

## The CLI Contract Surface

*The new CLI is close to usable, but its public help text is ahead of what the
handlers actually honor.*

### cli-version-flag-never-reaches-version-branch

**Top-level `jig --version` exits early with usage instead of printing the version**

**moderate** · `src/cli/index.ts:27-45` · effort: trivial ·
<img src="assets/sparkline-cli-version-flag-never-reaches-version-branch.svg" height="14" alt="commit activity" />

The CLI has version-printing code, but the early no-command exit runs first.
For `jig --version`, `parseArgs()` produces no positional command, so the user
gets the usage banner instead of the version string the help text promises.

```typescript src/cli/index.ts:27-45
if (!command || command === "help") {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}

const flagArgs = process.argv.slice(2);
if (flagArgs.includes("-h") || flagArgs.includes("--help")) {
  if (!command || command === "help") {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
  }
}

if (flagArgs.includes("-V") || flagArgs.includes("--version")) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json") as { version: string };
  process.stdout.write(pkg.version + "\n");
  process.exit(0);
}
```

Related: [dev-no-watch-flag-is-not-supported](#dev-no-watch-flag-is-not-supported),
[build-port-flag-is-ignored](#build-port-flag-is-ignored).

**Remediation:** handle `-V/--version` before the no-command exit, or parse it
as a top-level flag before subcommand dispatch.

### dev-no-watch-flag-is-not-supported

**The documented `jig dev --no-watch` flag does not disable hot-reload**

**significant** · `src/cli/dev.ts:27-40` · effort: small ·
<img src="assets/sparkline-dev-no-watch-flag-is-not-supported.svg" height="14" alt="commit activity" />

The command's own usage text advertises `--no-watch`, but the parser only
declares `watch`. Under strict parsing, that means the documented flag is
treated as unknown and the runtime never starts.

```typescript src/cli/dev.ts:27-40
Options:
  --port <n>       Serve over HTTP on this port (default: stdio)
  --no-watch       Disable hot-reload
  -h, --help       Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      port: { type: "string" },
      watch: { type: "boolean", default: true },
    },
```

**Remediation:** add an explicit `no-watch` option or normalize
`--no-watch` into `watch: false` before parsing. The flag in the help text and
the flag in the parser need to be the same flag.

Related: [cli-version-flag-never-reaches-version-branch](#cli-version-flag-never-reaches-version-branch),
[build-port-flag-is-ignored](#build-port-flag-is-ignored).

### build-port-flag-is-ignored

**The `jig build --port` option is advertised but never affects the bundle**

**moderate** · `src/cli/build.ts:29-45` · effort: small ·
<img src="assets/sparkline-build-port-flag-is-ignored.svg" height="14" alt="commit activity" />

The build command promises that `--port` bakes HTTP transport into the output
artifact. In this handler the flag is only parsed; it never influences the
embedded config, the runtime banner, or the generated file. That makes the
public CLI contract broader than the implementation.

```typescript src/cli/build.ts:29-45
Options:
  -o, --output <path>   Output file path (required)
  --bare                Produce a generic engine with no embedded YAML;
                        expects a sibling jig.yaml at runtime
  --port <n>            Bake in HTTP transport on this port (default: stdio)
  -h, --help            Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      bare: { type: "boolean", default: false },
      port: { type: "string" },
    },
```

Related: [http-transport-dns-rebinding](#http-transport-dns-rebinding).

**Remediation:** either thread `--port` into the generated artifact so it
changes the default transport, or remove the flag until that behavior exists.

*Verdict: the CLI bugs are narrow and local, but they directly affect first
use. The help text is not yet a reliable description of actual behavior.*

<div>&nbsp;</div>

## The Documentation Parity Surface

*Two README promises are ahead of the implementation: supported watcher types
and when `${VAR}` connection placeholders are actually resolved.*

### webhook-watcher-type-advertised-but-rejected

**README advertises `webhook` watchers, but the runtime only accepts `polling` and `file`**

**significant** · `README.md:289-305` · effort: medium ·
<img src="assets/sparkline-webhook-watcher-type-advertised-but-rejected.svg" height="14" alt="commit activity" />

The README tells users that `webhook` is a supported watcher type. The runtime
validator does not agree; it only accepts `polling` and `file`. A user who
follows the docs therefore gets a hard config error for a documented feature.

```markdown README.md:289-305
Expose data that MCP clients can read and subscribe to:

```yaml
resources:
  - uri: data://queue/pending
    name: Pending Jobs
    description: Current pending job count
    mimeType: application/json
    handler:
      exec: "./scripts/count-pending"
    watcher:
      type: polling
      interval_ms: 5000
      change_detection: hash
```

Watcher types: `polling` (interval + hash), `file` (filesystem watch), `webhook` (HTTP trigger).
```

**Remediation:** either remove `webhook` from the README immediately or
implement it end to end across the watcher schema, validator, and runtime
dispatcher together.

### env-vars-are-not-resolved-at-boot

**Connection header rules resolve on first use, not at boot as documented**

**significant** · `src/runtime/connections.ts:50-70` · effort: medium ·
<img src="assets/sparkline-env-vars-are-not-resolved-at-boot.svg" height="14" alt="commit activity" />

The README says `${VAR}` placeholders are resolved at boot and missing values
abort startup. The runtime does something weaker: it compiles header rules at
boot, but it evaluates them only when `resolveHeaders()` runs on first use.
That means unresolved credentials can survive startup and fail later at the
first outbound request.

```typescript src/runtime/connections.ts:50-70
/**
 * Resolve a compiled connection's headers to a concrete
 * Record<string, string>. Results are cached after first evaluation
 * because rules evaluate against an empty context — the output is
 * deterministic for the process lifetime.
 */
export async function resolveHeaders(
  compiled: CompiledConnection,
): Promise<Record<string, string>> {
  const cached = headerCache.get(compiled);
  if (cached) return cached;

  const out: Record<string, string> = {};
  for (const h of compiled.headers) {
    if (h.kind === "literal") {
      out[h.name] = h.value;
      continue;
    }
    const val = await evaluate(h.rule, {});
    out[h.name] = stringify(val);
  }
```

**Remediation:** either validate `${VAR}` references eagerly during config
loading and fail boot on missing values, or change the docs to describe the
current lazy resolution semantics accurately.

*Verdict: the docs are directionally right about the product shape, but in
these two areas they are currently describing planned behavior, not shipped
behavior.*

<div>&nbsp;</div>

## Remediation Ledger

| Finding | Concern | Location | Effort | Chains |
|---------|---------|----------|--------|--------|
| **The Command Execution Surface** |  |  |  |  |
| [exec-string-argv-injection](#exec-string-argv-injection) | significant | `src/runtime/handlers/exec.ts:40-57` | medium | related: [handler-parsing-is-order-dependent](#handler-parsing-is-order-dependent) |
| **The HTTP Surface** |  |  |  |  |
| [http-path-template-traversal](#http-path-template-traversal) | moderate | `src/runtime/handlers/http.ts:47-59` | small | none |
| [http-transport-dns-rebinding](#http-transport-dns-rebinding) | significant | `src/runtime/transports/http.ts:36-55` | medium | related: [build-port-flag-is-ignored](#build-port-flag-is-ignored) |
| **The Workflow Failure Surface** |  |  |  |  |
| [task-result-write-failures-swallowed](#task-result-write-failures-swallowed) | moderate | `src/runtime/tasks.ts:737-750` | small | related: [workflow-interpreter-is-too-dense](#workflow-interpreter-is-too-dense) |
| [transition-guard-errors-collapse-to-generic-stall](#transition-guard-errors-collapse-to-generic-stall) | moderate | `src/runtime/tasks.ts:669-688` | small | related: [workflow-interpreter-is-too-dense](#workflow-interpreter-is-too-dense) |
| **The Runtime Maintainability Surface** |  |  |  |  |
| [handler-parsing-is-order-dependent](#handler-parsing-is-order-dependent) | significant | `src/runtime/config.ts:658-736` | small | related: [exec-string-argv-injection](#exec-string-argv-injection) |
| [workflow-interpreter-is-too-dense](#workflow-interpreter-is-too-dense) | significant | `src/runtime/tasks.ts:534-667` | medium | related: [task-result-write-failures-swallowed](#task-result-write-failures-swallowed), [transition-guard-errors-collapse-to-generic-stall](#transition-guard-errors-collapse-to-generic-stall) |
| **The CLI Contract Surface** |  |  |  |  |
| [cli-version-flag-never-reaches-version-branch](#cli-version-flag-never-reaches-version-branch) | moderate | `src/cli/index.ts:27-45` | trivial | related: [dev-no-watch-flag-is-not-supported](#dev-no-watch-flag-is-not-supported), [build-port-flag-is-ignored](#build-port-flag-is-ignored) |
| [dev-no-watch-flag-is-not-supported](#dev-no-watch-flag-is-not-supported) | significant | `src/cli/dev.ts:27-40` | small | related: [cli-version-flag-never-reaches-version-branch](#cli-version-flag-never-reaches-version-branch), [build-port-flag-is-ignored](#build-port-flag-is-ignored) |
| [build-port-flag-is-ignored](#build-port-flag-is-ignored) | moderate | `src/cli/build.ts:29-45` | small | related: [http-transport-dns-rebinding](#http-transport-dns-rebinding) |
| **The Documentation Parity Surface** |  |  |  |  |
| [webhook-watcher-type-advertised-but-rejected](#webhook-watcher-type-advertised-but-rejected) | significant | `README.md:289-305` | medium | none |
| [env-vars-are-not-resolved-at-boot](#env-vars-are-not-resolved-at-boot) | significant | `src/runtime/connections.ts:50-70` | medium | none |

<sub>
Generated 2026-04-21 at commit 000653b1.
Intermediate artifacts: recon.yaml, findings.yaml, report.html.
</sub>
