# Handoff: jig runtime — Plan 1 Phases 0-3 complete

**Date:** 2026-04-14
**Branch:** main
**State:** Green

> Green = tests pass, safe to continue. 8/8 tests passing, typecheck clean, Phases 0-3 of Plan 1 merged via PRs #1–4.

## Where things stand

Plan 1 (the smoke-test path, [`record/plans/2026-04-14-jig-runtime-plan1.md`](../record/plans/2026-04-14-jig-runtime-plan1.md)) is ~60% through its six phases. The runtime has scaffolding, a YAML config loader with sibling-path discovery, and an `McpServer`-based stdio skeleton that responds to `initialize` with `serverInfo` derived from YAML. Phase 4 (inline handler + per-tool registration) and Phase 5 (example YAML + smoke target) remain.

## Decisions made

- **Package version `1.0.0-alpha.0`, not `0.x`.** Milestone labels ("Plan 1", "Plan 2", ...) decoupled from package version so schema-stable `1.0.0` ships without renumbering the plan sequence.
- **MCP SDK 2.x alpha with `McpServer`, not the deprecated `Server` class.** Rationale in the memory file `feedback_no_deprecated_api.md`. The adapter uses `fromJsonSchema()` (exported from the SDK) to bridge jig's JSON Schema → SDK's Standard Schema.
- **Sibling YAML resolution from `dirname(fileURLToPath(import.meta.url))`** — see [ADR-0005](../record/decisions/0005-sibling-yaml-from-import-meta-url.md). `--config PATH` is an explicit override.
- **SDK adapter quarantined to two files:** `src/runtime/server.ts` and `src/runtime/transports/stdio.ts`. No `@modelcontextprotocol/*` imports elsewhere.
- **Just-in-time scaffolding.** `package.json` has no `bin`, `build`, `start`, `clean`, or `dev` scripts yet — they arrive when the things they invoke exist. See `feedback_just_in_time_scaffolding.md`.
- **Feature branch per phase** (`feat/scaffolding`, `feat/config-loader`, `feat/mcp-stdio`). Agent writes `commit.txt`; Clay runs `gtxt` + `git pm`.
- **`@cfworker/json-schema` added as a direct dep.** SDK alpha.2's bundle eagerly imports it despite declaring it optional. Drop when the SDK fixes its bundler.

## What's next

1. **Phase 4 — inline handler + tool registration.** Plan samples at `record/plans/2026-04-14-jig-runtime-plan1.md:1028–1344` were written against the old `Server` adapter shape and must be adapted. The `ToolRegistry` class in the plan's Task 4.3 does **not** apply — `McpServer` is the registry. Instead: loop over `config.tools` in `src/runtime/index.ts` and call `server.registerTool(name, { description, inputSchema: toolToInputSchema(tool) }, handler)` for each. `toolToInputSchema` (plan lines 1095–1109) and `invokeInline` (plan lines 1145–1157) still useful. Handler is `async (args: unknown) => invokeInline(tool.handler)` for Plan 1's inline-only scope.
2. **Phase 5 — `examples/minimal.yaml`, `just smoke` recipe, completion handoff.** Plan lines 1346–1452.
3. **Plans 2–7.** Post-Plan-1 milestones covering dispatcher + exec/compute handlers (Plan 2), JSONLogic (Plan 3), connections/probes (Plan 4), resources/prompts/tasks (Plan 5), CLI (Plan 6), build pipeline (Plan 7).

## Landmines

- **The plan document is outdated from Phase 3 onward for SDK reasons.** Plan samples in Phase 4/5 assume `JigServerHandle.onToolsList`/`onToolsCall`. The adapter exposes `registerTool(name, spec, handler): RegisteredTool` + `connect(transport)` instead. Ignore the `ToolRegistry` class sketch; use per-tool `registerTool` calls in `index.ts`.
- **No-schema callback arity requires a two-closure split in the adapter.** `src/runtime/server.ts:158–177` handles this: when `inputSchema` is present the SDK calls `cb(args, ctx)`; when absent it calls `cb(ctx)`. Preserve this if Phase 4 touches the adapter.
- **Plan's "append" pattern for tests produces mid-file imports if taken literally.** Consolidate all imports at the top of any new test file. Bit us in Phase 2; code-quality review caught it.
- **Integration tests need `{ timeout: 10_000 }`.** Node test runner has no default per-test timeout; subprocess-based tests hang forever on bugs. See `tests/integration.test.ts:62` for the pattern.
- **`McpServer.setToolRequestHandlers()` installs lazily** on first `registerTool` call. Phase 3 has zero tools and the `tools/list` handler is therefore not wired — but `initialize` still works because Server construction handles it. Phase 4's first `registerTool` call flips this on.
- **`ref/` is globally gitignored** (`~/.gitignore:38`). Design doc links into `ref/*.md` resolve locally; external readers see 404. The four research reports are intentional private source material.
- **`commit.txt` is globally gitignored** (`~/.gitignore:31`). Agent writes it; Clay runs `gtxt` (= `git commit -F commit.txt && rm commit.txt`).
- **`.bito.yaml` is managed by the building-in-the-open plugin session-start hook.** Not committed. If it disappears during a session, restart — the hook regenerates it.
- **Memory files live at `/Users/clay/.claude/projects/-Users-clay-source-claylo-jig/memory/`.** Two feedback entries so far (`feedback_just_in_time_scaffolding.md`, `feedback_no_deprecated_api.md`). Read `MEMORY.md` there before dispatching Phase 4's implementer.
