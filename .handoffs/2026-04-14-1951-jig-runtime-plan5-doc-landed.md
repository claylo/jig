# Handoff: jig runtime — Plan 5 design + plan doc ready

**Date:** 2026-04-14
**Branch:** feat/plan5-doc (pending merge)
**State:** Green

> Green = Plan 4 closed earlier this session (PR #33, commit 510baf2). Plan 5 was brainstormed, designed, and written as a 6-phase implementation plan. The design doc is merged on main (PR #34, commit fe607a6). The plan doc is staged on `feat/plan5-doc` and carries this handoff alongside it so both land in the same commit. No code changes in Plan 5 yet — implementation begins in the next session under `superpowers:subagent-driven-development`.

## Where things stand

Plan 5 design at [`record/designs/2026-04-14-plan5-probes.md`](../record/designs/2026-04-14-plan5-probes.md) captures the seven brainstorming decisions and the architecture: `probes:` is a new top-level optional block of startup-time data fetches, exposed dually as `{{probe.NAME}}` (Mustache) and `{ var: "probe.NAME" }` (JSONLogic) across descriptions, handler config, transforms, and guards. The plan at [`record/plans/2026-04-14-jig-runtime-plan5.md`](../record/plans/2026-04-14-jig-runtime-plan5.md) breaks the work into Phase 0 (this doc + handoff) through Phase 5 (example + `smoke-probe` + integration + complete handoff), each on its own `feat/plan5-*` branch. 1825 lines, ~300 lines per phase — about half the size of Plan 4 because probes reuse the existing handler dispatch.

## Decisions made

- **Boot-only synchronous lifecycle.** Probes resolve once at server startup, before tool registration. Refresh and reload are deferred to a future plan; the schema is forward-compatible with a later `refresh_ms:`.
- **Fail-fast at boot.** Any probe failure (handler `isError`, timeout, malformed `map:`) writes a multi-line stderr block listing every failure and `process.exit(1)`. The MCP server does not start in a degraded state.
- **Network + exec handler types only.** `graphql:`, `http:`, `exec:`. `inline:` rejected (trivial — write the literal in the YAML), `compute:` rejected (redundant with `map:` on top of any other handler), `dispatch:` rejected (no `args` to discriminate at boot).
- **`map:` is JSONLogic.** No jq, no jsonata, no new dep. One expression engine across `transform:` / `when:` / `compute:` / `map:`. Reuses `evaluate()` from Plan 3 and the design doc's jq example gets rewritten in JSONLogic.
- **Dual surface.** Probe values are reachable from both Mustache (`{{probe.X}}`) and JSONLogic (`{ var: "probe.X" }`) via a new `InvokeContext.probe: Record<string, unknown>` field threaded into every handler's render and eval contexts.
- **Independent + parallel.** All probes fetch via `Promise.allSettled`; boot time = max(probe durations). Probes cannot reference other probes in v1 — `resolveProbes` always passes `probe: {}` to per-probe `invoke()` calls. A future DAG resolver lands as its own plan.
- **Per-probe `timeout_ms`, default 30 s.** No global cap. Catches hung exec probes (which today have no built-in timeout) without adding a separate "boot timeout" concept.

## What's next

1. **Merge Phase 0** — `gtxt && git pm` on `feat/plan5-doc`. Lands the plan doc plus this handoff.
2. **Open a fresh session, invoke `superpowers:subagent-driven-development`** against [`record/plans/2026-04-14-jig-runtime-plan5.md`](../record/plans/2026-04-14-jig-runtime-plan5.md). The plan is self-contained — feed each implementer only its own phase section plus the File Structure and Key Constraints blocks (the same "don't feed the whole plan" rule from Plan 4).
3. **Phase 1 first — `feat/plan5-types`.** Adds `ProbeSpec` + `ProbesConfig` types, creates `src/runtime/probes.ts` with `validateProbes`, wires it into `parseConfig`. Five tasks; 8 new config tests. See Tasks 1.1–1.5 in the plan.
4. **Each phase is one branch, one PR, one commit.** Clay runs `gtxt && git pm` between phases. Six gates all green before commit (`npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http`); Phase 5 adds `just smoke-probe` as the seventh.
5. **Phase 5 closes Plan 5** and writes a complete handoff naming Plan 6 (resources, prompts, completions, tasks) as next.

## Landmines

- **Phase 3 is a mechanical 6-file sweep.** Extending `InvokeContext` with `probe` breaks every existing handler that constructs the context — TypeScript catches the production sites, but tests that mock `InvokeContext` need `probe: {}` added too. Task 3.2 Step 1's typecheck failure points at every site; expect 5–10 test-side updates beyond the production handler edits.
- **`process.exit(1)` in `resolveProbes` is synchronous and total.** Any open file descriptors, sockets, or `setTimeout` handles in the parent get killed. Acceptable at boot; would need rework if a future plan calls the resolver from a long-running context. The Phase 2 failure tests use subprocess-spawn (heredoc + `process.execPath`) to capture exit + stderr — slow on CI.
- **`SendMessage` to a terminated subagent silently no-ops.** Plan 4's Phase 5 handoff prescribed "resume the SAME implementer via SendMessage" for fix cycles; this session learned that doesn't work because the subagent terminates after returning. For Plan 5: small fixes (a few lines) apply directly in the controller; larger fixes spawn a fresh `Agent` with a focused fix-only brief.
- **Pre-flag plan-originated defects in the implementer brief.** Plan 4 caught six across seven phases. Plan 5's plan doc was self-reviewed during writing and one YAML shape error in Task 5.3 was fixed inline before commit, but expect new ones to surface during implementation. The pattern that worked in Plan 4: scan the plan's code blocks for self-identical ternaries, dead constants, JSDoc references to non-existent helpers, case-sensitivity oversights, and validator behavior the commit message claims but the code omits.
- **`InvokeFn` signature evolves in Phase 3.** Dispatch's closure pattern from Plan 4 (`(h, a) => invoke(h, a, ctx)`) needs an additional `probe` arg passed through. Task 3.4 Step 1 spells out the closure update; do NOT modify `dispatch.ts` to reach for `ctx` directly — that re-creates the cycle Plan 4 fixed.
- **`smoke-probe` is hermetic by design** — the example uses two exec probes (`git rev-parse --short HEAD`, `whoami`). The graphql probe path is exercised by an integration test against a fixture `http.createServer()`, not by a smoke recipe. This keeps `just smoke-probe` runnable in CI without network.
- **Handoff filename guard hook enforces Eastern time.** A timestamp captured early in the session goes stale by the time you write the file. Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before naming the handoff file. The hook will block + tell you the correct name if you drift.
- **`commit.txt` is globally gitignored** — Clay runs `gtxt` (commits, removes the file) and `git pm` (push + PR + auto-merge). Don't expect `commit.txt` in `git status`.
- **`.config/bito.yaml` is a session-start hook drop.** Untracked by design; leave it out of staging. Specific-path `git add` (not `-A`) is the established Plan 4 convention and continues for Plan 5.
