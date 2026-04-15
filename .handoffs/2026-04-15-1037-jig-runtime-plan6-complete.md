# Handoff: jig runtime — Plan 6 complete (resources + watchers)

**Date:** 2026-04-15
**Branch:** feat/plan6-complete (ready for `gtxt && git pm`)
**State:** Green

> Green = main carries Phases 1–4 + the macOS symlink fix; Phase 5 is staged on `feat/plan6-complete` with all 8 gates passing. After `gtxt && git pm` lands Phase 5, Plan 6 is done and main is the place to start Plan 7.

## Where things stand

Plan 6 ships the `resources:` block end-to-end: schema + validator, static-URI registration with SDK-auto-wired `resources/list` / `resources/read`, subscribe/unsubscribe wired via `server.server.setRequestHandler` (McpServer's high-level class omits them), polling watcher (hash-baseline on first tick, emit on change), file watcher (`fs.watch` with `persistent: false`, path gated by `isPathAllowed`). The `feat/plan6-complete` branch adds `examples/resources.yaml`, the `just smoke-resource` recipe, the end-to-end round-trip integration test, and this handoff. 202 tests pass. 8 gates green.

## Decisions made

- **Split Plan 6 into 5 phases, not 6.** The Plan 5 handoff framed resources + watchers as one plan-sized block; this session carved it into three (Plan 6 = resources + watchers, Plan 7 = prompts + completions, Plan 8 = tasks + state machines). See `record/plans/2026-04-14-jig-runtime-plan6.md` Scope Note.
- **macOS symlink allowlist fix split into its own PR (#46).** Phase 4's file-watcher tests surfaced a pre-existing bug: `expandFsEntry` stored allowlist roots raw, but `isPathAllowed` canonicalized inputs via `realpathSync.native` — on macOS, `/var` → `/private/var`, so any `tmpdir()`-derived allowlist never matched. Fixed as a focused `fix(runtime):` PR before Phase 4 landed.
- **`trackSubscriptions()` + `startWatchers()` gated on `config.resources`.** Plan doc's literal wiring would have advertised `capabilities.resources.subscribe: true` on tools-only configs. Code quality reviewer caught the asymmetry; fix is in `src/runtime/index.ts:82-91`.
- **File-watcher path uses canonical (symlink-resolved) form.** `startFileWatcher` captures `isPathAllowed`'s return value and passes the canonical path to `fs.watch` rather than the raw input. Keeps the watched path consistent with the allowlist root.
- **FOLLOWUP(plan6) comment pattern.** The `registerResource` adapter has an intermediate `readCallback` variable that is pure indirection (unlike `registerTool`, which has a real SDK generic-inference workaround). Marked with a grep-able `FOLLOWUP(plan6):` comment in `src/runtime/server.ts:219` for a near-future cleanup pass.

## What's next

1. **Merge Phase 5** via `gtxt && git pm` on `feat/plan6-complete`. Stage: `examples/resources.yaml`, `justfile`, `tests/integration.test.ts`, `.handoffs/2026-04-15-1037-jig-runtime-plan6-complete.md`.
2. **Start Plan 7 (prompts + completions).** URI templates for resources belong here because template-variable completion is backed by the `completions:` surface; shipping half produces an awkward state. Design doc not yet drafted — follow the Plan 5/6 pattern: design doc → plan doc → phase-by-phase subagent dispatch.
3. **Plan 8 (tasks + state machines).** Largest v1 surface. Strict requirements are captured in the master design doc (`record/designs/2026-04-13-jig-design.md`). Expect a longer plan doc than Plan 6.
4. **FOLLOWUP(plan6) cleanup.** The one grep hit in `src/runtime/server.ts:219` — collapse the 5-line `readCallback` indirection down to a direct `handler` pass. ~2-minute chore PR whenever it feels natural.

## Landmines

- **`{ persistent: false }` is load-bearing on `fs.watch`.** Without it, the watcher handle keeps the event loop alive past stdin close. Integration tests silently hang until timeout.
- **Polling watcher establishes baseline on the FIRST tick, no emit.** `startPollingWatcher` in `src/runtime/resources.ts` fires an immediate `void tick()` after `setInterval(...)` so a client that subscribes and mutates inside the first interval still sees a subsequent update. Don't remove the immediate tick.
- **SDK's `mergeCapabilities` is one-level deep.** Adding `{ resources: { subscribe: true } }` after `registerResource` auto-sets `{ resources: { listChanged: true } }` yields the union — but this only works because the merge recurses exactly one level. Deeper nesting (e.g., future `resources.subscribe.persistent`) would clobber. The function lives inside the `@modelcontextprotocol/server` package source; grep there if the behavior ever needs re-verification, and note the file is a content-addressed build artifact whose name changes per release.
- **`registerCapabilities` throws `AlreadyConnected` if called after `server.connect()`.** Phase 3's `trackSubscriptions()` relies on the call order: `registerResource` (for all resources) → `trackSubscriptions` → `startWatchers` → `server.connect`. Enforced at the index.ts wiring site.
- **`server.server.setRequestHandler` is the ONLY SDK-surface crossing outside `server.ts`.** The SDK-quarantine invariant still holds because the low-level access lives inside `trackSubscriptions` in `server.ts`. Resist any future temptation to reach into `server.server` from sibling modules.
- **Polling watchers + rate-limited upstreams will hit limits.** A `watcher: { type: polling, interval_ms: 5000 }` on a `http:` handler against GitHub/Linear APIs is a rate-limit machine. The example YAML and its header comments flag this; watch for it when users author polling watchers.
- **`fs.watch` platform quirks.** macOS coalesces some atomic-save flows into a single `rename`; Linux delivers raw `change`. The emit-on-any-event strategy accepts duplicates. Windows is not targeted.
- **Plan docs have defects; pre-flight scan before dispatching.** Plan 4 caught 5, Plan 5 caught 4, Plan 6 caught 5 across Phases 2/3/4. The repeatable scan: check every `import` in plan code blocks against actual module exports; verify cross-phase ordering; verify test regexes against the error strings they expect to match (Phase 4 had the message and regex disagree on a single space). Scan lives in the Plan 6 plan doc's Landmines section at the tail.

## Orchestration notes (not project state)

- **`Agent` tool dispatch failed with `"This model does not support the effort parameter"` once in a prior session.** Explicit `model: "sonnet"` on every dispatch avoided recurrence across 10+ dispatches this session. Keep the explicit parameter; drop it only if a future session confirms it's unnecessary. Unrelated to the jig codebase — purely a session-orchestration quirk worth carrying forward.
