# jig

Build MCP servers from YAML. No code required.

```yaml
# jig.yaml
version: "1"
server:
  name: my-server
  version: "1.0.0"

tools:
  - name: hello
    description: Say hello
    input:
      name: { type: string, required: true }
    handler:
      compute:
        cat:
          - "Hello, "
          - { var: "name" }
          - "!"
```

```sh
jig dev
# → MCP server running, watching jig.yaml for changes
```

That's a working MCP server. The tool reads `name` from the input and returns a greeting. Change the YAML, the server reloads.

## What is jig?

Jig is a packaging tool for MCP servers. You write a `jig.yaml` describing your tools, resources, and prompts. Jig turns it into a standalone `.mjs` file that runs anywhere Node 24 is installed — no `npm install`, no `node_modules`, no build step for end users.

**Two ways to distribute your server:**

1. **Sibling YAML** — `jig build --bare` produces a generic `server.mjs`. Drop your `jig.yaml` next to it. End users run `node server.mjs` with no install step.
2. **Embedded YAML** — `jig build jig.yaml -o server.mjs` bakes the config into the bundle. One file, nothing alongside it.

## Install

Requires Node.js 24 or later.

```sh
git clone https://github.com/claylo/jig.git
cd jig
npm install
npm link
```

Now `jig` is available everywhere:

```sh
jig --version
# 1.0.0-alpha.0
```

## Quick start

### 1. Scaffold a config

```sh
jig new
# → creates jig.yaml from the minimal template
```

Pick a different starting point:

```sh
jig new dispatcher    # dispatcher pattern with actions
jig new --list        # see all available templates
```

### 2. Validate it

```sh
jig validate jig.yaml
# ok: my-server@1.0.0 — 1 tool
```

Exits 0 on success, 1 on error. CI-friendly.

### 3. Run it

```sh
jig dev
# → MCP server running over stdio, hot-reload enabled
```

### 4. Build a standalone server

```sh
jig build jig.yaml -o server.mjs
# ok: server.mjs (1065 KB)
```

The output is a single file with no dependencies beyond Node 24:

```sh
node server.mjs
```

For a generic server that reads YAML at runtime:

```sh
jig build --bare -o server.mjs
# End user drops their jig.yaml next to server.mjs
```

### 5. Configure an MCP client

Point Claude Desktop or Claude Code at the built server:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/server.mjs"]
    }
  }
}
```

Replace the path with wherever you put the built `.mjs`. That's it — no flags, no config files, no `node_modules`.

## Serving over HTTP

Add `--port` to serve MCP over Streamable HTTP instead of stdio:

```sh
jig dev --port 3000
# → serving MCP over HTTP at http://127.0.0.1:3000/mcp
```

Built servers work the same way:

```sh
node server.mjs --port 3000
```

Test with curl:

```sh
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
    "protocolVersion":"2025-11-05",
    "capabilities":{},
    "clientInfo":{"name":"curl","version":"0.1"}
  }}'
```

Without `--port`, the server uses stdio — the default for Claude Desktop, Claude Code, and most MCP clients.

## YAML reference

### Server

```yaml
version: "1"       # required — config format version
server:
  name: my-server   # required — shown to MCP clients
  version: "1.0.0"  # required — semver
  description: ...  # optional — shown to MCP clients
  instructions: ... # optional — system prompt for the client
  security:         # optional — access controls
    env:
      allow: ["MY_*"]           # env var patterns the server can read
    network:
      allow: ["api.example.com"] # hosts the server can reach
    filesystem:
      allow: ["."]               # paths for exec handlers
```

### Tools

Every server needs at least one tool. Jig supports six handler types:

```yaml
tools:
  - name: my-tool
    description: What this tool does
    input:
      field_name: { type: string, required: true, description: "..." }
    handler:
      # Pick one:
      inline:   { text: "static response" }
      exec:     "command {{field_name}}"
      compute:  { var: "field_name" }       # JSONLogic expression
      http:     { connection: my_api, method: GET, path: "/endpoint" }
      graphql:  { connection: my_api, query: "{ items { id } }" }
      dispatch: { on: action, cases: { ... } }
```

#### Handler types

| Type | What it does | When to use it |
|------|-------------|----------------|
| `inline` | Returns a static string | Help text, fixed responses |
| `exec` | Runs a shell command | Calling external binaries, scripts |
| `compute` | Evaluates a JSONLogic expression | Transforming data, conditional logic |
| `http` | Makes an HTTP request | REST API calls |
| `graphql` | Sends a GraphQL query | GraphQL API calls |
| `dispatch` | Routes to sub-handlers by action | Multi-action tools (the dispatcher pattern) |

#### The dispatcher pattern

One tool, multiple actions. A server with 10 actions as a single dispatcher tool uses far fewer tokens in tool-list context than 10 separate tools — each tool definition carries its own description, input schema, and metadata overhead:

```yaml
tools:
  - name: project
    description: |
      Project management. Actions: list, get, create, help.
      {"action": "list"}                    → all projects
      {"action": "get", "id": "PRJ-123"}   → project details
      {"action": "help"}                    → full docs

    input:
      action: { type: string, required: true }
      id:     { type: string }
      title:  { type: string }

    handler:
      dispatch:
        on: action
        cases:
          list:
            handler:
              http: { connection: api, method: GET, path: "/projects" }
          get:
            requires: [id]
            handler:
              http: { connection: api, method: GET, path: "/projects/{{id}}" }
          create:
            requires: [title]
            handler:
              http:
                connection: api
                method: POST
                path: "/projects"
                body: { title: "{{title}}" }
          help:
            handler:
              inline:
                text: "project: { list | get | create | help }"
```

### Connections

Declare upstream API credentials once, reference them by name:

```yaml
connections:
  api:
    url: https://api.example.com
    headers:
      Authorization: "Bearer ${API_TOKEN}"
    timeout_ms: 5000
```

Environment variables use `${VAR}` syntax and are resolved at boot. The server exits with an error if a referenced variable is missing.

### Probes

Fetch data at startup and bake it into tool descriptions:

```yaml
probes:
  git_sha:
    exec: "git rev-parse --short HEAD"
  teams:
    graphql:
      connection: api
      query: "{ teams { nodes { key name } } }"

tools:
  - name: my-tool
    description: "Built from {{probe.git_sha}}. Teams: {{probe.teams}}"
```

Probes run once at boot (and on hot-reload). If a probe fails, the server refuses to start.

### Resources

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

### Prompts

Template prompts with arguments:

```yaml
prompts:
  - name: analyze
    description: Generate an analysis prompt
    arguments:
      - name: target
        description: What to analyze
        required: true
      - name: depth
        description: "summary | detailed"
    template: |
      Analyze {{target}} at {{depth}} depth.
```

### Tasks

State-machine workflows for long-running operations:

```yaml
tasks:
  my_workflow:
    initial: validating
    states:
      validating:
        mcpStatus: working
        statusMessage: "Checking input"
        actions:
          - exec: "./validate {{input.id}}"
        on:
          - when: { "==": [{ var: "result.valid" }, false] }
            target: failed
          - target: processing

      processing:
        mcpStatus: working
        statusMessage: "Running job"
        actions:
          - exec: "./process {{input.id}}"
        on:
          - target: completed

      completed:
        mcpStatus: completed
        result:
          text: "Done: {{result.output}}"

      failed:
        mcpStatus: failed
        result:
          text: "Failed: {{result.error}}"
```

Wire a task to a tool with `execution.taskSupport`:

```yaml
tools:
  - name: run_job
    description: Run a job through the pipeline
    input:
      id: { type: string, required: true }
    execution:
      taskSupport: required
    handler:
      workflow:
        ref: my_workflow
        ttl_ms: 300000
```

### Completions

Provide auto-complete values for prompt and resource arguments:

```yaml
completions:
  prompts:
    analyze:
      depth: ["summary", "detailed"]
  resources:
    "data://jobs/{status}":
      status: ["pending", "active", "completed"]
```

### Transforms

Shape any tool's output with a JSONLogic expression. The transform receives `args` (the tool input), `result` (the raw handler output), and `probe` (boot-time probe data):

```yaml
tools:
  - name: example
    handler:
      exec: "./my-command"
    transform:
      cat:
        - "[result] "
        - { var: "result" }
```

Standard [JSONLogic operators](https://jsonlogic.com/) work, plus jig's built-in helpers like `cat`, `os.platform`, `env.get`, `file.is_dir`, and `time.now`. See `examples/compute-and-guards.yaml` for the full set in action.

### Guards

Gate dispatch cases with `when:` — a JSONLogic condition evaluated before the handler runs. If the guard returns falsy, the case is skipped:

```yaml
cases:
  admin_only:
    when: { "env.has": ["ADMIN_TOKEN"] }
    handler:
      exec: "./admin-action"
  public:
    handler:
      inline:
        text: "This action requires ADMIN_TOKEN to be set."
```

Guards have access to all tool input fields, probe data, and jig's built-in helpers. When a guard fails in a dispatch tool, jig falls through to the next matching case or returns an error if no case matches.

## Examples

The `examples/` directory has working configs for every feature:

| File | What it shows |
|------|--------------|
| `minimal.yaml` | Simplest possible server — one inline tool |
| `dispatcher.yaml` | Dispatcher pattern with exec handlers |
| `compute-and-guards.yaml` | JSONLogic compute handlers and `when:` guards |
| `http-and-graphql.yaml` | HTTP and GraphQL handlers with connections |
| `http-transport.yaml` | Serving over HTTP instead of stdio |
| `probes.yaml` | Startup probes baked into descriptions |
| `resources.yaml` | Resources with polling watchers |
| `prompts-completions.yaml` | Prompt templates with auto-complete |
| `tasks.yaml` | State-machine workflows |
| `tasks-elicitation.yaml` | Workflows with user input (elicitation) |
| `tasks-one-tool.yaml` | Dispatcher routing to workflows |

Validate any example:

```sh
jig validate examples/dispatcher.yaml
# ok: jig-dispatcher@1.0.0 — 1 tool
```

Run any example:

```sh
jig dev examples/http-transport.yaml --port 3000
```

## CLI reference

```
jig validate <jig.yaml>          Validate a config
jig dev [jig.yaml]               Run with hot-reload (default: jig.yaml)
jig dev --port 3000              Run over HTTP
jig dev --no-watch               Run without hot-reload
jig build <jig.yaml> -o out.mjs  Bundle with embedded YAML
jig build --bare -o out.mjs      Bundle without embedded YAML
jig new [template]               Scaffold from a template
jig new --list                   List available templates
jig --version                    Show version
jig --help                       Show help
```

## Architecture

The runtime is what your users run — it ships inside every `.mjs` you produce. The CLI is your authoring tool; it never reaches end users.

- **Runtime** (`src/runtime/`) — boots from YAML, serves MCP over stdio or HTTP. Four dependencies: the MCP SDK, a YAML parser, a JSONLogic engine, and a JSON Schema validator. This is why output bundles stay around 1 MB.
- **CLI** (`src/cli/`) — validates, bundles, scaffolds. Adds esbuild for bundling. Stays on your machine.

## License

MIT
