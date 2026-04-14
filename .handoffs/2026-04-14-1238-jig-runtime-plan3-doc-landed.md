# Handoff: jig runtime — Plan 3 plan doc + ADR-0008 landed

**Date:** 2026-04-14
**Branch:** main
**State:** Green

> Green = main carries ADR-0008 and the Plan 3 plan doc; Plan 2 runtime remains fully working (38/38 tests, both smoke recipes). No Plan 3 code yet — Phase 1 is where implementation begins.

## Where things stand

This session captured two artifacts on `main`: [ADR-0008](../record/decisions/0008-jsonlogic-builtin-helpers.md) (#13) naming the 16 read-only JSONLogic helpers jig ships in v1, and [Plan 3](../record/plans/2026-04-14-jig-runtime-plan3.md) (#15) — the six-phase implementation plan for `json-logic-engine` v5 + `compute:` handler + `when:` guards + tool-level `transform:` + those 16 helpers. Plan 2's runtime surface is untouched; the next session starts on `feat/plan3-jsonlogic` and implements Phase 1.

## Decisions made

- **16 helpers, fixed set, read-only, no author extension API.** Five namespaces: `file`, `env`, `path`, `os`, `time`. Full list and safety boundary in [ADR-0008](../record/decisions/0008-jsonlogic-builtin-helpers.md).
- **`when:` and `requires:` compose as AND on dispatch cases.** `when:` is evaluated first (broader environmental gate — "only on macOS"), `requires:` second (per-field input shape). Either failing produces a distinct `isError` message. Captured inline in Plan 3 Phase 4, not as an ADR.
- **`transform:` lives at the tool level only.** Case-level and handler-level transforms are out of scope for v1. Authors who need per-case shapes pre-shape in the handler. Captured inline in Plan 3 Phase 5.
- **Helpers register at module load** via a side-effect import in `src/runtime/index.ts` (added in Phase 2). One engine singleton in `util/jsonlogic.ts`, one registration.
- **No new ADRs for Plan 3.** ADR-0008 covers helpers; the other decisions (`when`/`requires` composition, transform placement, compute purity) live in the plan doc. Supersede ADR-0008 rather than editing it if transforms later need hashing/encoding helpers.

## What's next

1. **Start Phase 1.** Branch `feat/plan3-jsonlogic`. Task 1.1 adds `json-logic-engine@^5.0.0` to `package.json`; Task 1.1 Step 3 has an ad-hoc node one-liner to verify the v5 API matches expectations before writing code. If the API differs, the plan's Tasks 1.3–1.4 need adjusting first.
2. **Phase 2 lands the 16 helpers** in a single `src/runtime/util/helpers.ts`. Test fixtures (`tests/fixtures/helpers/present.txt`, `subdir/nested.txt`) are part of Phase 2's Task 2.1.
3. **Phase 3 widens the `Handler` union** and extends `invoke()` in `src/runtime/handlers/index.ts:16` with a new `compute` arm. The `const _never: never = handler;` exhaustive check at line 25 turns the widening into a brief compile-error checkpoint (Task 3.1 Step 2 expects RED; Task 3.5 turns it GREEN).
4. **Phases 4–6** add `when:` guards, `transform:`, and the example + smoke + handoff. All six phases ship as separate PRs on feature branches.

Execution mode choice deferred to the next session — subagent-driven per the writing-plans skill's recommendation, or inline. Plan 3's first sentence names `superpowers:subagent-driven-development` as the required sub-skill.

## Landmines

- **Two identical `land plan 3` commits on main** (#14 and #15, 28 seconds apart). Diffs are empty between them; harmless. If you see the double entry in `git log` and wonder — it's not a bug.
- **`json-logic-engine` v5 API is unverified.** Plan 3 codes against `AsyncLogicEngine.addMethod(name, fn)` / `.run(logic, data)` based on the design doc's example. Phase 1 Task 1.1 Step 3 is the sanity check — run it before trusting the later tasks. If the package ships without TypeScript types, Plan 3 Task 1.3 Step 3 has the minimal `.d.ts` stub to drop into `src/types/`.
- **Phase 3's typecheck-red intermediate state is intentional.** Adding `ComputeHandler` to the `Handler` union breaks the exhaustive `never` check in `handlers/index.ts` until Task 3.5 adds the `compute` arm. Don't try to "fix" the red in Task 3.1; it's load-bearing.
- **Async responses arrive out of request order over stdio** (inherited Plan 2 landmine). Plan 3's integration test at Phase 6 Task 6.3 matches responses by `id` via a `Map`, not by array position. Preserve the pattern.
- **Helpers resolve relative paths against the *runtime* directory**, not `process.cwd()`. In dev, that's `src/runtime/util/`; post-esbuild (Plan 7), it's wherever `server.mjs` lives. The rule matches [ADR-0005](../record/decisions/0005-sibling-yaml-from-import-meta-url.md); Plan 7 should confirm the path survives bundling.
- **Transform parses handler output as JSON when possible.** A handler returning `"42"` gets a numeric `result` in transform's data; one returning `"platform=darwin"` gets a string. Authors who need always-string handling do it in the handler, not the transform.
- **`.bito.yaml` and `commit.txt` stay globally gitignored.** Agent writes `commit.txt`; Clay runs `gtxt` + `git pm`. `.bito.yaml` regenerates from the building-in-the-open plugin's session-start hook.
