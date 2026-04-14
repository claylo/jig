# Handoff: jig runtime — Plan 4 through Phase 5 (HTTP handler) complete

**Date:** 2026-04-14
**Branch:** feat/plan4-http (pending merge)
**State:** Green

> Green = Phases 1–5 are merged on main; Phase 5 lands on main in the same commit as this handoff. All five gates pass (`npm run check`, `npm test`, `just smoke`, `just smoke-dispatch`, `just smoke-compute`). 143/143 tests. Phase 6 (GraphQL) and Phase 7 (example + `smoke-http` + integration + Plan 4 close) remain.

## Where things stand

Plan 4 is 5/7 done. Phase 0 landed the plan doc; Phase 1 landed the `${VAR}` shim; Phase 2 landed `connections:` schema + compilation; Phase 3 landed network host confinement (`isHostAllowed`); Phase 4 landed the `performFetch` wrapper; Phase 5 lands the `http:` handler plus the `invoke(handler, args, ctx: InvokeContext)` signature change that threads compiled connections. Phase 6 specializes `performFetch` for GraphQL; Phase 7 writes the example, adds `just smoke-http`, and closes the plan.

## Decisions made (operational, not architectural)

- **Two-stage review per phase.** Spec compliance first, code quality second. Every phase surfaced at least one code-quality issue that spec review alone would have missed.
- **Specific-path `git add` over `git add -A`.** Plugin hooks can drop files mid-session (see Phase 1's `.github/` incident); specific paths keep scope clean. This is the default going forward.
- **Plan-originated defects are expected.** Five phases, five plan-code audits, four with defects caught — one self-identical ternary, one non-existent helper in JSDoc, one dead const + one case-sensitivity oversight, one missing unknown-key rejection + one incomplete Content-Type case check. Preempt by scanning the plan's code blocks before dispatching.

## What's next

1. **Merge Phase 5** — specific-path add + `gtxt && git pm` on `feat/plan4-http`:
   ```
   git add src/runtime/config.ts src/runtime/handlers/index.ts src/runtime/index.ts \
           src/runtime/handlers/http.ts tests/config.test.ts tests/handlers.test.ts && \
     gtxt && git pm
   ```
2. **Open a fresh session, invoke `superpowers:subagent-driven-development`** against `record/plans/2026-04-14-jig-runtime-plan4.md` Phase 6 (lines 2399–2833). Branch: `feat/plan4-graphql`.
3. **Phase 6 pattern (four tasks):** add `GraphqlHandler` type + `validateGraphql` in `src/runtime/config.ts`; add ~7 tests in `tests/handlers.test.ts`; implement `src/runtime/handlers/graphql.ts` (fixed POST shape, auto-detect `errors:` → `isError`, default mode extracts `data`, `envelope` mode returns raw `{data, errors, extensions}`); wire a `graphql` arm into `invoke()` in `src/runtime/handlers/index.ts` using `invokeGraphql(handler, args, ctx.connections)` — same shape as the existing `http` arm.
4. **Phase 7 (after Phase 6 merges)** — `feat/plan4-complete`: write `examples/http-and-graphql.yaml`, add `just smoke-http` recipe, add an integration test with `{ timeout: 10_000 }`, and write the Plan 4 complete handoff naming Plan 5 (probes) as next.

## Landmines

- **`invoke()` signature changed in Phase 5.** `invoke(handler, args, ctx: InvokeContext)` now; `ctx.connections: Record<string, CompiledConnection>`. The `InvokeFn` type in `src/runtime/handlers/dispatch.ts:10-13` stayed stable via a closure: the dispatch arm reads `(h, a) => invoke(h, a, ctx)`. **Do NOT touch `dispatch.ts`** — the closure keeps it acyclic. Phase 6 adds its arm exactly like http: `if ("graphql" in handler) return invokeGraphql(handler, args, ctx.connections);`.

- **Central `invoke()` has ONE external call site** (`src/runtime/index.ts:55`). Tests call `invokeExec` / `invokeDispatch` / `invokeCompute` / `invokeInline` / `invokeHttp` directly and use a `testInvoke` mock (`(handler, args) => Promise<ToolCallResult>`) matching `InvokeFn`. Phase 6's `invokeGraphql` follows the same three-arg signature; no test-side mock changes.

- **Plan doc is 3235 lines** — feed a subagent only its phase section + File Structure + Key Constraints. Do not feed the whole plan.

- **Plan-originated defects to scan for before dispatching Phase 6:** self-identical ternaries, dead `const` variables, JSDoc references to helpers that may not exist, case-insensitive operations that only cover 1–2 casings, commit messages promising validator behavior the validator omits. Phase 5's `validateHttp` missed unknown-key rejection despite the commit message claiming it.

- **`commit.txt` is globally gitignored** (it is consumed by `gtxt` which removes it). Do not look for it in `git status`.

- **`.bito.yaml` disappears between sessions** — regenerates from the building-in-the-open session-start hook. Not a blocker.

- **`capturing-decisions` skill's frontmatter has a shell bug** (`${user_config.doc_output_dir}` unresolved at hook expansion). Invocation fails with `bad substitution`. Workaround: read the skill's SKILL.md directly (`~/.claude/plugins/cache/claylo-marketplace/building-in-the-open/1.1.0/skills/capturing-decisions/SKILL.md`) and follow the MADR process manually.

- **HEAD and OPTIONS methods are deferred, not rejected** — the plan doc's "deferred" section names them as "expected in a point release once v1 lands."

- **Subagent dispatch pattern:** one implementer per phase, followed by spec reviewer, followed by code quality reviewer. When the quality reviewer finds issues, resume the SAME implementer via `SendMessage` — do not spawn a new `Agent` for fix cycles. Context preservation matters.

- **Phase 5 tests spawn `node:http.createServer` fixtures on port 0 bound to 127.0.0.1.** The allowlist must include `127.0.0.1` per test — tests already do this with `configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd())`. Phase 6's tests will follow the same fixture pattern.
