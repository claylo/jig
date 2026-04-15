# Handoff: jig runtime — Plan 5 complete

**Date:** 2026-04-14
**Branch:** feat/plan5-complete (pending merge)
**State:** Green

> Green = Phases 1–4 are merged on main (commits 37a0066, f1cc408, 2f296d8, 2a526a6 / PRs #36–#39). Phase 5 lands on main in the same commit as this handoff. All seven gates pass: `npm run check`, `npm test` (181/181), `just smoke`, `just smoke-dispatch`, `just smoke-compute`, `just smoke-http`, `just smoke-probe`. Plan 5 is complete with this commit.

## Where things stand

Authors can declare `probes:` — a top-level YAML block of startup-time data fetches exposed as `{{probe.NAME}}` (Mustache) and `{ var: "probe.NAME" }` (JSONLogic) across tool descriptions, handler config, transforms, and guards. `examples/probes.yaml` bakes `git rev-parse --short HEAD` and `whoami` into a dispatcher tool's description, handler command line, and transform — demonstrating every surface in one file.

## What changed

Five implementation phases (Phase 0 landed the plan doc):

- **Phase 1** — `probes:` schema + `validateProbes` in `src/runtime/probes.ts` — `37a0066` / claylo/jig#36
- **Phase 2** — `resolveProbes` boot resolver with per-probe timeout + fail-fast — `f1cc408` / claylo/jig#37
- **Phase 3** — `InvokeContext.probe` plumbed through every handler + `util/transform.ts` — `2f296d8` / claylo/jig#38
- **Phase 4** — boot-sequence wiring + description pre-rendering at registration time — `2a526a6` / claylo/jig#39
- **Phase 5** — example + `smoke-probe` + graphql round-trip integration test + this handoff — pending commit on `feat/plan5-complete`

## Decisions made

- **Boot-only synchronous lifecycle** — Probes resolve once at server startup, before tool registration. Refresh and reload deferred to a future plan; schema is forward-compatible with `refresh_ms:`.
- **Fail-fast at boot** — Any probe failure (handler `isError`, timeout, malformed `map:`) writes a multi-line stderr block listing every failure, then `process.exit(1)`. No degraded start.
- **Network + exec handler types only** — `graphql:` / `http:` / `exec:` accepted as probe handlers. `inline:`, `compute:`, `dispatch:` rejected at parse time.
- **`map:` is JSONLogic, not jq** — One expression engine across `transform:` / `when:` / `compute:` / `map:`. Reuses `evaluate()` from Plan 3.
- **Handler signatures normalized to `(handler, args, ctx: InvokeContext)`** — `invokeExec` / `invokeCompute` / `invokeHttp` / `invokeGraphql` all take the full `ctx`. `invokeDispatch` keeps its `InvokeFn` closure + gains a 4th `probe: Record<string, unknown>` param to preserve Plan 4's dispatch-cycle fix.
- **`InvokeContext` lives in `src/runtime/handlers/types.ts`** — Moved from `./index.ts` to break the circular import `exec.ts → index.ts → exec.ts`. Re-exported from `./index.ts` for existing consumers.
- **Tool descriptions pre-rendered at registration time** — `createServer(config, probe)` captures the resolved probe map in a closure; `registerTool` renders `{{probe.X}}` in descriptions via Mustache before forwarding to the SDK. Args aren't available at registration time — `{{args.X}}` renders to empty string.
- **Probes cannot reference probes in v1** — `resolveProbes` passes `probe: {}` to per-probe `invoke()` calls; a probe whose handler config references `{{probe.X}}` gets empty string. A DAG resolver lands as its own plan.

## What's next

1. **Merge Phase 5 / close Plan 5** — `gtxt && git pm` (commit from `commit.txt`; push + open PR + auto-merge) on `feat/plan5-complete` after Clay reviews the staged set.
2. **Open a fresh session for Plan 6** — resources (+ watchers), prompts, completions, tasks (state machines). The probe surface is stable; resources extend the boot-resolved-data pattern with filesystem-event watchers triggering re-resolution. See `record/designs/2026-04-13-jig-design.md` for the plan sequence.
3. **Before dispatching Plan 6 phases, scan the plan doc's code blocks for defects.** Plan 4 caught 5, Plan 5 caught 4 across 5 phases (see Landmines for the recurring patterns). Pre-flight scans pay for themselves.

## Landmines

- **`process.exit(1)` in `resolveProbes` is synchronous and total** (`src/runtime/probes.ts:164`). Any open file descriptors, sockets, or `setTimeout` handles in the parent get killed. Acceptable at boot; would need rework if a future plan calls the resolver from a long-running context.
- **Description rendering bakes `{{probe.X}}` at registration time only.** A future async-refresh plan must re-register the tool AND emit `notifications/tools/list_changed` for description updates to propagate. See `src/runtime/server.ts:157,173`.
- **`{{args.X}}` in descriptions renders to empty string** — args aren't available at registration time; Mustache sees no matching key. This was always the case but is more visible now that server.ts Mustache-renders every description. An author who writes `{{args.something}}` in a description expecting interpolation will be surprised.
- **`InvokeContext` imports must come from `./types.ts`, not `./index.ts`.** Handlers under `src/runtime/handlers/*.ts` would re-create the circular import if they pull from `./index.ts`. `dispatch.ts` MUST NOT import `InvokeContext` at all — it takes `probe: Record<string, unknown>` as a separate 4th arg (Plan 4's dispatch-cycle fix).
- **`examples/probes.yaml` requires a git-checked-out working directory.** The `git_sha` probe runs `git rev-parse --short HEAD`. In a non-git directory the resolver fail-fasts with a multi-line stderr block.
- **Subprocess failure-path tests in `tests/probes.test.ts`** use `process.execPath` + `--input-type=module` heredocs to drive `resolveProbes` and observe `process.exit(1)`. Each takes ~0.5–2s; four tests total. Consider mocking `process.exit` if CI time becomes painful.
- **Plan docs have defects; pre-flag before dispatching.** Across Plan 4 and Plan 5 (13 phases) we caught 9 plan-originated defects during implementation: missing re-exports, type ordering dependencies between phases, self-contradictory code/test/design triples, incorrect assertion expectations, dead config in examples. Repeatable pre-dispatch scan:
  - Check every `import` in plan code blocks against actual module exports.
  - Verify cross-phase ordering — a phase's ctx shape must match the interface as of that phase, not a later phase.
  - Verify assertion expectations against handler behavior (stringification, parsing, trailing newlines).
- **Handoff filename guard hook enforces Eastern time.** Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before naming the handoff file. A timestamp captured early in the session goes stale by the time you write.
- **`commit.txt` is globally gitignored** — consumed by `gtxt` (which removes it). Not in `git status`.
- **`.config/bito.yaml`** is a session-start hook drop from the building-in-the-open plugin. Untracked by design; leave out of staging.
- **Specific-path `git add` over `-A`** — plugin hooks drop files mid-session. Continued from Plan 4's convention.
