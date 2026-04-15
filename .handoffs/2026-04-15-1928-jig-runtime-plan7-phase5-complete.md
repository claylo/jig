# Handoff: jig runtime — Plan 7 phases 1-5 complete, Phase 6 next

**Date:** 2026-04-15
**Branch:** `main`
**State:** Green

> Green = main carries Phases 1-5 merged (PRs #52–#56). 235/235 tests pass. All 8 current gates green. Phase 6 is the final ship phase and introduces the 9th gate.

## Where things stand

Five of six Plan 7 phases landed in one session: schema + validator (#52), registration + `prompts/list`/`prompts/get` (#53), URI-templated resources (#54), completions schema + cross-ref validator (#55), `wireCompletions` + `completion/complete` handler (#56). Autocomplete works end-to-end for prompt arguments and resource template variables; only the demonstrable artifact (example YAML, smoke recipe, end-to-end integration, plan-complete handoff) remains. Plan 7 doc: `record/plans/2026-04-15-jig-runtime-plan7.md`.

## Decisions made

- **Execution pattern per phase:** pre-flight scan plan doc → feature branch → ONE implementer subagent (Sonnet) for the whole phase → spec reviewer → code-quality reviewer (Opus) → apply trivial Minor cleanups directly (3 times this session) → Clay runs `gtxt && git pm`. Six phases scoped in the plan; this pattern scales to all of them.
- **Pre-flight scan caught six plan defects** before dispatch across Phases 2, 3, 5 (type-system consequences of the `ResourceSpec` union upgrade, redundant `req.params` cast, test regex vs error message mismatch, runtime rendering asymmetry between `inline` and `exec` handlers). Every catch saved at least one typecheck roundtrip.
- **`hasMore` formula corrected in Phase 5.** The plan's formula `filtered.length < values.length` contradicted its own test assertion `hasMore === false`. Implementer surfaced the contradiction via RED test output and corrected to `capped.length < allMatching.length` (cap-truncation semantics). The two-local pattern (`allMatching` / `capped`) is the canonical shape for paginated/capped responses in this codebase.
- **`PromptCallback<StandardSchemaWithJSON>` cast does not compile** where `ToolCallback<StandardSchemaWithJSON>` compiles identical code. TS resolves the SDK conditional type differently at the cast site. Fallback: `cb as Parameters<typeof server.registerPrompt>[2]`. Lives in `src/runtime/server.ts` at the Phase 2 registerPrompt implementation.
- **Watcher helpers narrow to a local alias.** Post-Phase-3, `src/runtime/resources.ts` declares `type ResourceSpecStatic = Extract<ResourceSpec, { uri: string }>;` and both `startPollingWatcher` and `startFileWatcher` take `resource: ResourceSpecStatic`. `startWatchers`'s caller narrows automatically after the `!spec.watcher` guard because `ResourceSpecTemplated.watcher?: never`.

## What's next

1. **Phase 6 — the ship phase.** Branch: `feat/plan7-complete`. Plan doc lines 2285-2628. Six tasks:
   - `examples/prompts-completions.yaml` exercising all three Plan 7 surfaces (prompts + templated resources + completions) in one file.
   - `just smoke-prompt` recipe driving `initialize` → `prompts/list` → `prompts/get` → `resources/templates/list` → `completion/complete`.
   - End-to-end integration test at `tests/integration.test.ts` chaining all seven MCP methods.
   - Plan-complete handoff at `.handoffs/`.
   - Commit stages **four** paths (different from Phases 1-5): `examples/prompts-completions.yaml`, `justfile`, `tests/integration.test.ts`, `.handoffs/<new-file>.md`.
2. **Plan 8 (tasks + state machines)** after Plan 7 merges — largest v1 surface; strict requirements in `record/designs/2026-04-13-jig-design.md`. Fresh session recommended.
3. **Minor follow-up (not Phase 6):** document inline-vs-exec Mustache divergence in `src/runtime/handlers/inline.ts`. Future plan authors writing `inline: { text: "{{var}}" }` would silently not render; `exec:` is the path that Mustache-renders.

## Landmines

- **Plan 7's own Landmines section** (`record/plans/2026-04-15-jig-runtime-plan7.md:2665-2685`) still applies to Phase 6. Read before dispatching.
- **Nine-gate suite for Phase 6.** `just smoke-prompt` joins the existing eight: `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`. All nine must pass before the commit.
- **Phase 6 commit stages four files including the handoff.** Prior phases staged three files; do not pattern-match from them. The handoff goes into `.handoffs/` with an ET timestamp from `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` run immediately before writing the file.
- **`invokeInline` does NOT Mustache-render its text field.** The Phase 6 example YAML must use `exec:` (or `http:` / `graphql:`) for any handler that needs template-variable interpolation. Direct evidence: Phase 3's templated-resource integration test at `tests/integration.test.ts` — the originally-spec'd `inline: { text: "jobs with status={{status}}" }` was rewritten to `exec: "echo jobs with status={{status}}"` to make the variable render.
- **SDK quarantine still holds.** `src/runtime/prompts.ts` and `src/runtime/completions.ts` import zero symbols from `@modelcontextprotocol/server`. All three low-level handler sites (subscribe, unsubscribe, completion/complete) live in `src/runtime/server.ts`. Phase 6 touches only test/example/justfile surfaces; no new SDK imports expected. Plan landmine notes a future `lowLevelHandlers.ts` extraction may be warranted — explicitly out of scope for Plan 7.
- **`commit.txt` is globally gitignored.** `gtxt` consumes it directly; `git add commit.txt` fails without `-f`. Not a problem, but surprises implementers who expect to stage it alongside the code files.
- **Phase 6's smoke recipe is the first JSON-RPC sequence that drives ALL seven Plan 7-touching methods** (`initialize`, `prompts/list`, `prompts/get`, `resources/templates/list`, `resources/read`, `completion/complete` with both ref types). `jq` assertions accumulate; expect the recipe to be longer than `smoke-resource`.
