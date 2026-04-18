# Handoff: Runtime complete — ready for CLI (Plan 10)

**Date:** 2026-04-16
**Branch:** main
**State:** Green — 302 tests, 12 smoke gates pass

## Where things stand

The jig runtime is feature-complete through Plan 9. All YAML surfaces are implemented: tools (inline, exec, dispatch, compute, http, graphql, workflow), connections, probes, resources (static + templated + watchers), prompts, completions, tasks (state-machine workflows with `working`/`input_required`/`completed`/`failed` states), and form-mode elicitation. The runtime boots from `src/runtime/index.ts` with `--config <path>` and serves MCP over stdio. No CLI exists yet — Plan 10 builds it.

## What was built (Plans 1-9)

- **Plan 1:** Smoke test — minimal YAML boots, initialize handshake works
- **Plan 2:** Dispatcher + exec + Mustache template rendering
- **Plan 3:** JSONLogic compute handlers, guards, transforms, 16 built-in helpers
- **Plan 4:** Connections (named upstream credentials/URLs) + HTTP + GraphQL handlers
- **Plan 5:** Probes (startup-time data fetches exposed as `{{probe.NAME}}`)
- **Plan 6:** Resources (static URI + file/polling watchers + subscriptions)
- **Plan 7:** Prompts, completions, URI-template resources
- **Plan 8:** Tasks — state-machine workflows, `InMemoryTaskStore`, `workflow:` handler, dispatcher-task fusion
- **Plan 9:** Elicitation — `input_required` states, form-mode `elicitation/create` round-trip

## What's next

Plan 10 covers the CLI half of jig. The design doc ([`record/designs/2026-04-13-jig-design.md`](record/designs/2026-04-13-jig-design.md)) defines the target surface:

1. **`jig dev [JIG.YAML]`** — run as MCP server with hot-reload (author dev loop). This is essentially what `node --experimental-transform-types src/runtime/index.ts --config <path>` does today, wrapped in a CLI entrypoint with file watching.
2. **`jig validate JIG.YAML`** — lint + type-check the YAML (CI-friendly). `parseConfig` already does this — needs a CLI wrapper that exits 0/1 with human-readable output.
3. **`jig build JIG.YAML -o OUT.mjs`** — bundle to single-file ESM via esbuild. Embeds the YAML, produces a standalone `.mjs` with no runtime dependencies.
4. **`jig build --target mcpb`** — wrap as Claude Desktop `.mcpb` bundle.
5. **`jig new [TEMPLATE]`** — scaffold a new `jig.yaml` from templates.

The design doc has more detail on `--bare` mode, `--with-oauth`, and the `.mcpb` format.

## Key architecture notes

- **SDK quarantine:** Only `src/runtime/server.ts` and `src/runtime/transports/stdio.ts` import from `@modelcontextprotocol/server`. Everything else uses jig-owned types.
- **No new runtime deps since Plan 1.** Node 24+ built-ins + `yaml` + `json-logic-engine` + `@modelcontextprotocol/server@2.0.0-alpha.2`.
- **`InMemoryTaskStore` keeps the event loop alive.** Any process hosting task tools must be killed explicitly — `stdin.end()` won't terminate it.
- **Boot call order:** `registerPlainTool`/`registerTaskTool` → `registerResources` → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`

## Landmines

- **`node --experimental-transform-types`** is required to run `.ts` directly. The CLI/build pipeline needs to handle this — esbuild strips types for the built artifact, but the dev loop needs the flag.
- **macOS GUI MCP clients can't find `node`** due to nvm PATH issues. The design doc calls this out — the `.mcpb` format and sibling-YAML resolution (`import.meta.url`) are the mitigations. See `resolveConfigPath` in `config.ts`.
- **Plan 8 `when:` clauses on dispatch cases are NOT evaluated under task-tool fusion** — documented known limitation.
- **All plan docs and design docs** are in `record/plans/` and `record/designs/`.
