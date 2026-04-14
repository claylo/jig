# jig

**Date:** 2026-04-13
**Status:** Draft

## Overview

Jig is a single-file Node.js packaging tool for one-and-done MCP server install. Authors write a `jig.yaml`; jig produces an executable `.mjs` (and optionally a Claude Desktop `.mcpb` bundle) that ships with no runtime dependencies and no install step beyond download. End users never see YAML, never run `npm install`, and never edit configs by hand.

## Context

The MCP ecosystem has a token-cost problem. The standard Playwright MCP costs 13,678 tokens per session before any tool call; the standard Linear MCP costs roughly 17,000. Both stem from over-granular tool definitions — one tool per operation, each with its own description. Jesse Vincent (fsck.com) showed that a *dispatcher* pattern — one tool with an `action` enum and per-action handler routing — collapses these to under 1,000 tokens with the same functional surface. His streamlinear MCP demonstrates the pattern in production and proves the savings are real.

Several frameworks already do "MCP from config." None target the niche we want:

| Project | Lang | Differentiator | Install model |
|---|---|---|---|
| mcp-server-llmling | Python | Fully YAML-driven | `uvx` |
| pforge | Rust | YAML → compiled Rust handlers | `cargo install` + Rust toolchain |
| MXCP | Python | YAML + SQL; data analytics | pip + venv |
| rust-mcp-core | Rust | Production auth; Rust library | `cargo add` |
| Snowflake `CREATE MCP SERVER` | SQL-in-YAML | Managed; Snowflake-only | Snowflake account |
| streamlinear | TypeScript | One-off; fsck-pattern by hand | `npx` |

Nobody claims the **Node.js + single-file + dispatcher-opinionated + hot-reload + declarative-logic** quadrant. Jig fills it.

The constraints driving the design:

- **MCP spec 2025-11-25** is the target — experimental Tasks, URL-mode elicitation, Streamable HTTP transport
- **Node.js 24+** as the runtime — top-level await is fully supported, ESM is the path of least resistance, and most MCP clients already have Node available
- **Two install surfaces** — Claude Desktop's `.mcpb` (double-click) and Claude Code marketplace plugins
- **Zero PATH friction** — GUI MCP clients on macOS frequently fail to find `node` or `npx` because of nvm interactions; the design has to sidestep this without making the user paste absolute paths
- **Iteration speed** — the dispatcher pattern only pays off when tool descriptions are tuned, and tuning needs sub-second feedback

## Approach

### Mental model

Jig is a packaging tool, not a framework. Two halves:

- **Runtime** — TypeScript code that ships *inside* every produced `.mjs`. Reads embedded or sibling YAML, serves MCP over stdio or HTTP, watches for YAML changes, reloads live.
- **CLI** — TypeScript code that authors run. Validates YAML, bundles via esbuild, optionally wraps as `.mcpb`.

Authors run the CLI. End users run the `.mjs`. The CLI is never on the end user's machine.

### CLI surface

```bash
jig new [TEMPLATE]                  # scaffold a new jig.yaml
jig dev [JIG.YAML]                  # run as MCP server with hot-reload (author dev loop)
jig validate JIG.YAML               # lint + type-check the YAML (CI-friendly)
jig build JIG.YAML -o OUT.mjs       # bundle to single-file ESM (default)
jig build --target mcpb JIG.YAML -o OUT.mcpb   # wrap as Claude Desktop bundle
jig build --bare -o OUT.mjs         # generic engine, no embedded YAML
jig build --with-oauth ...          # opt-in feature bundles
```

`jig build` accepts a positional YAML to embed as the baseline configuration. `--bare` produces a generic engine that requires sibling YAML at runtime — the "curl the .mjs and drop YAML next to it" model.

### YAML schema, top level

```yaml
server:              # name, version, description, instructions
user_config:         # what end users are prompted for at install time
extension_points:    # how this YAML composes with sibling YAML at runtime
connections:         # named upstream credentials/URLs (referenced from handlers)
probes:              # startup-time data fetches (exposed as {{probe.NAME}})
tools:               # tool definitions (dispatcher-style or classic per-op)
resources:           # resource definitions with watcher specs
prompts:             # prompt templates with arguments
tasks:               # workflow state machines
completions:         # autocompletion sources for prompt/resource args
```

### Tools

We support two patterns: classic per-operation tools (one tool per action) and the dispatcher pattern (one tool with an `action` enum and internal routing). Authors can mix them. We bias toward dispatcher in templates and documentation because it solves the token-cost problem the standard MCPs created.

The dispatcher pattern uses **typed flat fields** — every possible field declared at the top level of `input:`, with per-action requirements declared on dispatch cases. We rejected the alternative (an untyped `payload` field whose meaning depends on `action`) because it loses client-side validation and produces worse error messages. Streamlinear's production design vindicates this choice: it uses 13 typed flat fields, not a payload catch-all, even though its author wrote the post that originally proposed payload.

```yaml
tools:
  - name: linear
    description: |
      Linear issues. Actions: help, search, get, update, comment, create, graphql.
      
      Teams (workflow states):
      {{#each probe.teams}}  {{key}}: {{states | join(", ")}}
      {{/each}}
      
      {"action": "search"}                 → your active issues
      {"action": "get", "id": "ABC-123"}   → issue details
      {"action": "help"}                   → full docs
    
    input:
      action:    { type: string, required: true }   # enum inferred from dispatch cases
      query:     { type: [string, object] }
      id:        { type: string }
      state:     { type: string }
      priority:  { type: integer, minimum: 0, maximum: 4 }
      assignee:  { type: string, nullable: true }
      body:      { type: string }
      title:     { type: string }
      team:      { type: string }
      graphql:   { type: string }
      variables: { type: object }
    
    handler:
      dispatch:
        on: action
        search:
          exec: ./handlers/search {{query}}
        get:
          requires: [id]
          exec: ./handlers/get {{id}}
        update:
          requires: [id]
          exec: ./handlers/update {{id}} --state {{state}}
        graphql:
          requires: [graphql]
          graphql:
            connection: linear_api
            query: "{{graphql}}"
        help:
          auto: true   # jig synthesizes help text from the dispatch spec
```

Built-in handler types:

| Type | Purpose |
|---|---|
| `exec` | Shell command (with templating; security caveats below) |
| `http` | HTTP request via shared `connections:` block |
| `graphql` | GraphQL query via shared `connections:` block |
| `dispatch` | Control flow — routes to other handlers based on input |
| `compute` | Pure JSONLogic expression (no side effects) |
| `inline` | Static return value |

The `help: { auto: true }` shorthand tells jig to synthesize a help action from the dispatch specification — action list, required fields per action, examples lifted from the description. Authors can override with `help: { text: "..." }` or `help: { exec: "..." }` for custom help.

### Templating: two layers

We split templating into two layers because the wrong tool for the wrong job hurt us in earlier sketches:

- **Mustache `{{var.path}}`** — for STRING interpolation only. Command lines, URLs, description text, error messages.
- **JSONLogic** (via `json-logic-engine` v5) — for CONDITIONAL LOGIC. Guards (`when:`), response transforms (`transform:`), state-machine transitions (`when:`), probe shaping (`map:`).

JSONLogic rules are JSON objects, and YAML is a JSON superset, so a rule embedded in YAML parses natively without escaping or string serialization:

```yaml
when:
  and:
    - { "!=": [{ "var": "id" }, ""] }
    - { ">=": [{ "var": "priority" }, 0] }
```

The custom operator registry lets jig expose named functions that authors call from YAML:

```javascript
// In jig's runtime
engine.addMethod("queue.length", async () => queue.length);
```

```yaml
when: { ">": [{ "queue.length": [] }, 0] }
```

The cost is roughly 500 KB of bundle, the active-maintenance status of `json-logic-engine` is solid, and async operators mean guards can hit disk, HTTP, or a database before deciding. The expressiveness gain is large: authors write declarative logic without us inventing a scripting language.

### Resources

Resources reuse the same handler types as tools and add a `watcher:` spec for change notifications:

```yaml
resources:
  - uri: queue://jobs/pending
    name: Pending Jobs
    description: Real-time pending job queue. Subscribe to receive notifications.
    mimeType: application/json
    handler:
      exec: ./handlers/list-pending
    watcher:
      type: polling
      intervalMs: 5000
      changeDetection: hash
```

Watcher types in v1: `polling` (interval + content hash), `file` (`fs.watch`), `webhook` (HTTP endpoint that triggers a notification). Notifications fire `notifications/resources/updated` per the MCP spec.

Resource subscriptions are a deliberately lightweight pub/sub — server emits "URI changed" with no payload; client decides whether to re-read. This matches the spec and works around the reality that several MCP clients (notably Claude Desktop as of early 2026) ignore subscription notifications. Servers that emit them stay correct; clients that don't subscribe simply poll via `resources/read`.

### Prompts

Prompts are templates with declared arguments:

```yaml
prompts:
  - name: analyze_job
    description: Generate an analysis prompt for a completed job
    arguments:
      - name: jobId
        description: The job ID to analyze
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: |
      Analyze the results of job {{jobId}}.
```

Argument completion (when the client requests `completion/complete`) draws from the `completions:` top-level block — inline value lists per prompt argument or per resource template argument.

### Tasks and state machines

Tasks are first-class. The MCP 2025-11-25 spec defines five task states (`working`, `input_required`, `completed`, `failed`, `cancelled`) with strict transition rules and tool-level negotiation (`execution.taskSupport: required | optional | forbidden`). Jig translates YAML state machines into this spec.

```yaml
tools:
  - name: process_job
    execution:
      taskSupport: required
    handler:
      workflow: { ref: process_job_workflow }

tasks:
  process_job_workflow:
    initial: queued
    states:
      queued:
        mcpStatus: working
        statusMessage: "Queued for processing"
        on:
          - event: dequeue
            target: validating
      
      validating:
        mcpStatus: working
        statusMessage: "Validating input"
        actions:
          - exec: ./handlers/validate {{input.jobId}}
        on:
          - event: validation_passed
            target: executing
            when: { "var": "result.valid" }
          - event: validation_failed
            target: failed
      
      executing:
        mcpStatus: working
        statusMessage: "Running job"
        actions:
          - exec: ./handlers/execute {{input.jobId}}
        on:
          - event: needs_approval
            target: awaiting_approval
            when: { "==": [{ "var": "result.status" }, "needs_approval"] }
          - event: complete
            target: completed
      
      awaiting_approval:
        mcpStatus: input_required
        statusMessage: "Waiting for approval"
        elicitation:
          message: "Approve to continue?"
          schema:
            approved: { type: boolean }
        on:
          - event: approved
            target: executing
            when: { "var": "elicitation.approved" }
          - event: rejected
            target: cancelled
      
      completed:
        mcpStatus: completed
        result:
          text: "Job {{input.jobId}} processed successfully"
      
      failed:
        mcpStatus: failed
        result:
          text: "Job failed: {{result.error}}"
```

Key properties:

- Authors declare states with rich internal semantics; jig maps them to the coarser MCP statuses the spec defines
- Transitions are guarded by JSONLogic — `when:` evaluates against `input`, `probe`, `result`, and `elicitation` data
- Actions invoke any handler type during a state — exec, http, graphql, compute
- `input_required` states declare elicitation schemas; jig handles the `elicitation/create` flow back to the client
- Terminal states declare result shaping (text or structured content)
- Idempotency: repeated `tasks/get` calls return the same task; retried `tools/call` with the same task ID returns the same task instead of spawning duplicates

This section of the design is the most consequential because the first real jig user has strict task state machine needs. The xstate-style YAML serialization is the lean; it borrows from sismic statecharts and the perplexity reports' suggestions. We expect to refine the action-set and transition-event vocabulary as the first user works through real workflows.

### Connections and probes

Connections declare upstream credentials and URLs once. Handlers reference them by name:

```yaml
connections:
  linear_api:
    url: https://api.linear.app/graphql
    headers:
      Authorization: "${env.LINEAR_API_TOKEN}"
```

```yaml
handler:
  graphql:
    connection: linear_api
    query: "{{graphql}}"
```

Probes are startup-time data fetches whose results are exposed throughout the YAML as `{{probe.NAME}}`. They cover streamlinear's pattern of fetching teams and workflow states at boot and baking them into the tool description:

```yaml
probes:
  teams:
    graphql:
      connection: linear_api
      query: |
        query { teams { nodes { key name states { nodes { name } } } } }
    map: |
      .teams.nodes | map({ key, states: .states.nodes | map(.name) })
```

The `map:` step is a JSONLogic expression (or jq-style transform) that shapes the raw response into something easier to interpolate. Probes run on startup and on every reload, so live information stays live.

### user_config

The `user_config:` block declares what the end user is prompted for at install time. Jig translates it into the appropriate manifest sections per build target:

```yaml
user_config:
  LINEAR_API_TOKEN:
    description: "Your Linear API token (lin_api_...)"
    required: true
    secret: true
    docs_url: https://linear.app/settings/account/security
  DEFAULT_TEAM:
    description: "Default team key for new issues (e.g. ENG)"
    required: false
    default: "ENG"
```

Translation:
- `.mcpb` build → manifest's `user_config` section. Claude Desktop renders a form, masks secrets, stores them in the OS keychain, and passes them as environment variables when launching the server
- Plain `.mjs` build → required-env-vars docstring at the top of the file plus a runtime check on boot that prints a clear message naming any missing required vars

We chose `user_config:` over `inputs:` to avoid collision with `input:` (the tool inputSchema slot).

### Extension points

When sibling YAML is present alongside an embedded baseline, the `extension_points:` block declares how they compose. We chose explicit per-section policy from day one because shifting from append-only to per-section policy later would break every existing `jig.yaml`.

```yaml
extension_points:
  tools: append           # users can add tools, can't override author's
  prompts: append
  connections: merge      # deep merge per connection name
  probes: merge
  server: locked          # users can't change server identity
  user_config: locked     # users can't add install-time prompts
```

Sensible defaults if `extension_points:` is omitted:

| Section | Default | Rationale |
|---|---|---|
| `tools`, `resources`, `prompts`, `tasks` | `append` | Extending the surface is the common case |
| `connections`, `probes` | `merge` | Adding a connection or overriding an env var is common |
| `user_config` | `locked` | Author defines install-time prompts; users shouldn't add prompts |
| `server` | `locked` | Sibling can't masquerade as a different server |

Authors who never write `extension_points:` get reasonable behavior. Authors who do can lock down anything.

### Distribution model

Three install paths, ranked by friction:

1. **`.mcpb` for Claude Desktop** — author runs `jig build --target mcpb`, ships the bundle. User double-clicks. Claude Desktop prompts for `user_config` values, stores secrets in the keychain, manages launch.
2. **`curl` + drop** — author publishes `server.mjs` at a stable URL. User runs `curl -O https://.../server.mjs`, drops it in any directory, optionally adds sibling YAML, pastes a 4-line block into `.mcp.json`. Server resolves YAML relative to its own location (`dirname(fileURLToPath(import.meta.url))`), sidestepping the PATH issues that plague GUI MCP clients on macOS with nvm.
3. **`npm install -g`** — standard npm path. Works for power users who already manage Node carefully. PATH issues remain a risk on GUI clients.

The `curl` + drop path is the model we push: stable URL for the latest `server.mjs`, easy refresh via `curl -O`, no install ceremony, no version management beyond "redownload."

### Build pipeline

```
src/
  runtime/                # ships inside every produced .mjs
    index.ts              # entry; CLI arg parsing, transport selection
    config.ts             # YAML loading, embedded vs sibling, extension_points
    server.ts             # MCP wiring (capability negotiation, request dispatch)
    tools.ts              # tool registry, dispatcher pattern, help auto-gen
    resources.ts          # resource registry, watchers, notification engine
    prompts.ts            # prompt templates, argument rendering
    tasks.ts              # state machine engine, MCP task mapping
    transports/
      stdio.ts
      http.ts             # Streamable HTTP via @modelcontextprotocol/node
    handlers/
      exec.ts
      http.ts
      graphql.ts
      dispatch.ts
      compute.ts          # JSONLogic-only handler
    util/
      template.ts         # Mustache-style {{var}}
      jsonlogic.ts        # json-logic-engine wrapper + custom operator registry
      env.ts              # ${env.VAR} expansion
  cli/                    # ships separately as `jig`
    new.ts
    dev.ts
    validate.ts
    build.ts
config/
  default-bare.yaml       # empty config used in --bare mode
scripts/
  build-cli.mjs           # esbuild for the CLI
  build-runtime.mjs       # esbuild for the runtime template
```

Esbuild produces:

- The CLI as its own bundled `.mjs`, distributed via npm
- The runtime as a generic ESM module with embedded MCP SDK + JSONLogic engine + YAML parser
- For each user `jig build` invocation, esbuild compiles the runtime with the user's YAML inlined via `--define` or a text loader, plus any opt-in feature bundles (`--with-oauth` etc.)

We use the official MCP SDK's 2.x tree (`@modelcontextprotocol/server`, `/client`, `/node`) once it stabilizes. Until then, we may track 1.x and migrate when 2.0 ships proper.

### Plugin escape hatch

We ship no plugin trait system in v1. Authors who need real code drop into `exec:` and call out to a separate binary they ship alongside `server.mjs` — the streamlinear pattern, where `streamlinear-cli` does all the actual Linear API work and the MCP server is a thin dispatcher over it. This keeps single-file deployment intact, avoids the security surface of runtime code loading, and matches the way the most successful YAML-driven MCP in the wild already works.

If `exec:` proves insufficient — for instance, if a class of authors needs in-process state, async event loops, or shared connection pooling that can't go through a subprocess — we revisit in a later version with a real plugin model. We don't pre-build for that scenario.

## Alternatives considered

- **CJS output (`.cjs`)** — three of our research reports recommended this to dodge top-level await issues with the SDK's SSE transport. Rejected because we target node24 ESM, which supports top-level await natively. ESM with shebang is the cleaner path.
- **Python target (parallel runtime)** — `.mcpb` accepts Python entrypoints. Rejected for v1 because supporting Python means re-implementing every jig feature in Python and keeping two runtimes in sync. The audience pull for Python MCPs is speculative; the maintenance cost is real.
- **Rust CLI** — Clay's preferred language, and Rust would give us a static jig binary distributable independently from Node. Deferred because the runtime must be JavaScript anyway (it ships in the `.mjs`); sharing the YAML schema between validator and runtime is genuinely valuable when both are TypeScript; and the CLI's job is small enough that Rust's speed advantage doesn't show up. Rust earns its weight only when the build pipeline starts doing heavy work like signing, native dependency bundling at scale, or polyglot compilation.
- **Untyped dispatcher payload** (the Chrome MCP `payload` field from the fsck.com post) — rejected in favor of typed flat fields. Streamlinear's production code uses 13 typed optional fields and validates per-action requirements at handler entry; the original post advocated untyped but the same author shipped typed when it mattered. Typed fields give clients usable inputSchema and produce clearer error messages.
- **Plugin trait system with runtime-loaded extensions** — rejected for v1. Adding a runtime plugin loader breaks single-file deployment, adds a security surface, and duplicates what `exec:` already provides. Streamlinear proved the `exec:` + companion-binary pattern works.
- **Sibling YAML appends only (no override)** — rejected in favor of explicit `extension_points:` from day one. Migrating from append-only to per-section policy later would break every existing `jig.yaml` written under the original assumption.
- **Consumer-managed reload** (rust-mcp-core's pattern: `runtime.reload_config(new_config)`) — rejected in favor of automatic file watching. Auto-watch matches the iteration loop that makes the dispatcher pattern viable; tweaking tool descriptions is the main work and a slow reload kills it.
- **Mustache for everything** — rejected. Mustache handles string interpolation cleanly; conditional logic needs a real expression layer. Mustache plus ad-hoc string templating in handlers would push authors into bash interpolation, which is a different security surface and a worse ergonomics story.
- **`json-logic-js` (the original library)** — rejected in favor of `json-logic-engine` v5: function compilation gives a 2x performance gain over `json-logic-rs`, async operators support tool handlers that hit external APIs, sync and async engines are both available, active maintenance through 2025.
- **Three build targets (`.mjs`, `.mcpb`, Claude Code plugin directory)** — rejected the plugin directory target. Two targets cover the install paths that matter; a generated plugin directory adds scaffolding complexity for an install path that users can do by hand in 60 seconds with the `.mjs` artifact.
- **Walking up from CWD for sibling YAML discovery** (bito's pattern) — rejected for jig because MCP clients launch the server with unpredictable CWD. Resolving relative to `dirname(fileURLToPath(import.meta.url))` sidesteps this and matches the "drop server.mjs and YAML in the same directory" mental model.

## Consequences

**What we gain:**

- Single-file deployment that works in every MCP client without `npm install` friction
- Authors write YAML once and get one-click Claude Desktop install via `.mcpb`, plus `curl`-drop install for everyone else
- Hot-reload at runtime makes iteration on tool descriptions tractable — the dispatcher pattern only pays off when descriptions are tuned, and tuning needs fast feedback
- Typed dispatcher gives MCP clients a usable `inputSchema`; per-action requirement validation gives clear error messages
- JSONLogic guards and transforms keep logic declarative without inviting a scripting language into YAML
- `extension_points:` lets authors ship a baseline that users extend without forking, and the policy is explicit per section
- Sibling YAML discovery from `server.mjs`'s own directory sidesteps the PATH issues that plague GUI MCP clients on macOS with nvm

**What we lose:**

- Bundle size: the runtime, JSONLogic engine, MCP SDK, and YAML parser all come along in every produced server — roughly 1-2 MB per binary
- Authors who need custom code must ship a separate executable callable from `exec:` — not as ergonomic as a plugin trait, but it preserves single-file deployment for the MCP server itself
- TypeScript-everywhere means the CLI starts up slower than a Rust equivalent; the cost is small but real
- Authors writing handlers in other languages (Python, Rust) bundle their own helpers and call out via `exec:` or `http:`; jig itself stays Node-only

**What we defer:**

- Resource notification mechanisms beyond polling, file watch, and webhook (database triggers, message queue subscriptions)
- Bidirectional task semantics (server-initiated tasks back to client) and `tasks.requests.*` capabilities beyond `tools.call`
- Plugin trait system for runtime-loaded extensions — revisit only if `exec:` proves insufficient for a real class of authors
- Cross-platform `.mcpb`-equivalent for non-Anthropic clients (none exists as of this writing)
- Authentication beyond what `exec:` and HTTP `connections:` already provide; OAuth flows arrive as `--with-oauth` opt-in bundles in v0.2 or v0.3
- Runtime schema validation via Ajv — relying on JSON Schema accuracy and on MCP clients validating before sending until production data tells us otherwise
- A polyglot codegen path (YAML → Python or Rust source) — interesting but it kills hot-reload and doubles the schema-drift surface

## Related decisions

ADRs to extract from this document (prompted next):

1. Single-file ESM `.mjs` output as primary distribution (vs `.cjs` or platform binaries)
2. Typed flat-field dispatcher pattern (vs untyped `payload` catch-all)
3. JSONLogic via `json-logic-engine` for declarative conditional logic
4. `extension_points:` per-section composition policy from day one
5. Sibling YAML discovery from `dirname(import.meta.url)` rather than CWD
6. No plugin system in v1 — `exec:` is the escape hatch
7. Two transports (stdio + HTTP) in one binary (vs separate flavors)
8. TypeScript for both runtime and CLI (deferring Rust)
9. Two build targets only (`.mjs` and `.mcpb`); no Claude Code plugin generation
10. Auto-watch sibling YAML for hot-reload (vs consumer-managed reload)

References:

- [`ref/claude-report.md`](../../ref/claude-report.md) — initial research on MCP spec coverage and bundling approaches
- [`ref/chatgpt-deep-research-report.md`](../../ref/chatgpt-deep-research-report.md) — alternate research with concrete hand-rolled implementation
- [`ref/perplexity-YAML-Driven, Single-File MCP Server  Architecture & Design Guide.md`](../../ref/perplexity-YAML-Driven,%20Single-File%20MCP%20Server%20%20Architecture%20&%20Design%20Guide.md) — MCP 2025-11-25 spec deep-dive and the open-source landscape
- [`ref/perplexity-MCP Server Design Clarifications  ESM Shebang, JSONLogic, npm Distribution.md`](../../ref/perplexity-MCP%20Server%20Design%20Clarifications%20%20ESM%20Shebang,%20JSONLogic,%20npm%20Distribution.md) — ESM over CJS, JSONLogic, npm distribution patterns, `.mcpb` format
- [Jesse Vincent — "When it comes to MCPs, everything we know about API design is wrong"](https://blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis.md)
- [streamlinear](https://github.com/obra/streamlinear) — the dispatcher pattern in production (typed flat fields)
- [rust-mcp-core](https://github.com/nullablevariant/rust-mcp-core) — Rust YAML-driven framework with plugin escape hatches
- [bito](https://github.com/claylo/bito) — sibling YAML config discovery pattern
