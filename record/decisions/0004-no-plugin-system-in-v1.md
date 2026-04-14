---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0004: No plugin system in v1; `exec:` is the escape hatch for custom code

## Context and Problem Statement

Jig is a YAML-driven packager: authors write `jig.yaml`, jig emits a single-file `server.mjs` that ships with no install step. Every mature MCP framework in our landscape scan — rust-mcp-core, pforge, mcp-server-llmling, FastMCP — offers a plugin system so authors can register custom handlers in their language of choice. How should jig let authors extend behavior beyond the handler types (`exec`, `http`, `graphql`, `dispatch`, `compute`, `inline`) we ship in the box?

## Decision Drivers

- **Single-file deployment is the product.** The `.mjs` artifact must run without sibling files required for the server to work. Anything that forces a second install step erodes the core value proposition.
- **Security surface must stay bounded.** Shelling out to a subprocess is a different trust model than loading and executing code inside the server process. We want the easy thing to be the safe thing.
- **Proven pattern in the wild.** Streamlinear — the most successful YAML-driven MCP we have studied — solves this with a companion binary. The MCP server (`mcp/src/index.ts`) is a 45-line dispatcher over `streamlinear-cli`, which holds all the actual Linear API logic. Authors who need real code already have a working template to copy.
- **Speculative demand.** We have no author in hand asking for in-process plugins. Building the loader, sandbox, and registry now means carrying that weight before the requirement is real.

## Considered Options

- **`exec:` + companion binary (the streamlinear pattern)** — authors ship a separate executable alongside `server.mjs` and call it from YAML handlers
- **Plugin trait system (rust-mcp-core style)** — authors implement a trait, compile a Rust crate, register at server startup
- **Runtime-loaded JS/TS modules via dynamic `import()`** — authors ship a `.mjs` plugin file sibling to `server.mjs`; the runtime loads it on boot
- **WebAssembly modules** — authors compile to WASM; the server loads and invokes them in a sandboxed runtime

## Decision Outcome

Chosen option: **`exec:` + companion binary**, because it preserves single-file deployment for the server itself, keeps the in-process security surface minimal, and matches a pattern already shipping in production. Authors who need arbitrary logic write a CLI in whatever language they prefer, ship it next to `server.mjs`, and reference it from YAML handlers:

```yaml
handler:
  exec: ./handlers/search --query {{query}}
```

The MCP server stays a thin dispatcher. The CLI holds the logic. Two binaries, one process boundary between them, no runtime code loading.

### Consequences

- Good, because the `.mjs` artifact stays self-contained — no plugin loader, no sandbox, no registry code in the runtime
- Good, because the security model is obvious: the server spawns subprocesses with explicit command lines and arguments. There is no "did this untrusted code execute in my process?" question to answer.
- Good, because authors are not locked into Node.js for extension code. A Rust, Python, or Go binary works identically from `exec:`.
- Good, because we keep a clear revisit criterion: a real class of authors needing in-process state, shared connection pools, or async event loops that subprocesses cannot carry.
- Bad, because authors pay subprocess spawn cost per call — fork, exec, stdin/stdout handshake. For handlers invoked hundreds of times per second this is a real tax. We accept it because MCP tool calls are inherently conversational, not hot-loop.
- Bad, because sharing state across calls requires the author to run their companion as a long-lived daemon the server talks to over HTTP or a socket — meaningfully more work than a trait-based plugin would be.
- Bad, because we leave a gap against the frameworks that ship plugin systems. Authors comparing jig against rust-mcp-core will see "no plugins" as a missing feature until they understand the escape hatch.

### Confirmation

We know the decision was implemented correctly when the runtime ships no dynamic import path, no plugin registry, and no trait interface for handlers beyond the built-in types. The YAML schema exposes `exec:` as the documented route for custom logic. Template projects in `jig new` use `exec:` for any non-trivial handler so authors encounter the pattern early.

## Pros and Cons of the Options

### `exec:` + companion binary

Authors ship a CLI alongside `server.mjs` and call it from YAML. The server process spawns, passes arguments, reads stdout.

- Good, because the subprocess boundary is the security boundary — no untrusted code runs in the server
- Good, because it is language-agnostic — authors write in the language they know
- Good, because we already needed `exec:` for "shell out to git" and "run a script" use cases; plugins ride for free
- Neutral, because streamlinear's production code proves the pattern handles a real workload (Linear API integration with GraphQL, caching, workflow state) without any in-process plugin machinery
- Bad, because subprocess overhead per call — measurable on tight loops, negligible on conversational turns
- Bad, because stateful extensions require authors to stand up a daemon separately

### Plugin trait system (rust-mcp-core style)

Authors implement a handler trait in Rust, compile a crate, register the plugin at startup.

- Good, because calls are in-process and cheap — no fork/exec per invocation
- Good, because shared state across calls is straightforward — the plugin lives in the server's address space
- Bad, because plugins are per-language. We would have to pick one (JavaScript, matching the runtime) and force every extension author into that ecosystem.
- Bad, because plugins are per-platform. A compiled extension needs pre-built binaries for macOS arm64, macOS x86_64, Linux arm64, Linux x86_64 — install coordination we explicitly rejected by going single-file.
- Bad, because it breaks the single-file deployment promise. The `.mjs` becomes one of several artifacts the user must install and keep in sync.

### Runtime-loaded JS/TS modules via dynamic `import()`

Authors ship `plugin.mjs` next to `server.mjs`; the runtime dynamically imports it on boot.

- Good, because no subprocess overhead; calls are in-process function invocations
- Good, because authors already writing TypeScript for jig find the model familiar
- Bad, because it breaks single-file deployment — `server.mjs` alone no longer runs the full system
- Bad, because it opens a code-execution security surface that `exec:` deliberately avoids. A malicious or compromised `plugin.mjs` runs with the server's full privileges, direct access to env vars, file system, and network.
- Bad, because it forces extension authors into Node.js. Anyone preferring Rust, Python, or Go has to context-switch into JavaScript just to extend jig.

### WebAssembly modules

Authors compile to a `.wasm` module; the server loads and invokes it in a sandboxed runtime.

- Good, because in-process speed with a real sandbox — best of both worlds in principle
- Good, because language-agnostic at the source level (Rust, Go, AssemblyScript all target WASM)
- Bad, because WASM-in-Node tooling for MCP workloads is immature as of early 2026. The toolchain for async I/O, system-level access, and embedded runtimes is still shaking out.
- Bad, because we have no author asking for it. Building a WASM host for speculative demand is exactly the kind of premature abstraction we reject elsewhere in the design.

## More Information

**Revisit criterion.** We revisit this decision when a real class of authors emerges who need one or more of: in-process state shared across calls, an async event loop that cannot be rehydrated per subprocess invocation, shared connection pooling (database pools, HTTP keep-alive) that dies when the subprocess exits. Until evidence exists, `exec:` is sufficient.

When we do revisit, WebAssembly becomes the likely candidate — the sandbox story is cleaner than dynamic `import()`, and the ecosystem will be more mature.

**References.**
- Design doc: [`/Users/clay/source/claylo/jig/record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md) — see the "Plugin escape hatch" section (around line 433) and the plugin-system entry under "Alternatives considered" (around line 445)
- Streamlinear production code — `mcp/src/index.ts` is a thin dispatcher, `streamlinear-cli` is where the logic lives
- rust-mcp-core — the plugin trait system we chose not to mirror
