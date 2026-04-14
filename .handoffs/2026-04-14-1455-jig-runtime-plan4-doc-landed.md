# Handoff: jig runtime — Plan 4 design, ADRs, and plan doc ready

**Date:** 2026-04-14
**Branch:** feat/plan4-doc (pending merge)
**State:** Green

> Green = Plan 4 is fully scoped and documented. Design doc, ADR-0010, and ADR-0011 are merged on main (#24). The implementation plan doc is ready on `feat/plan4-doc` and carries this handoff alongside it so both land in the same commit. No code changes in Plan 4 yet — implementation begins in the next session under `superpowers:subagent-driven-development`.

## Where things stand

Plan 3 closed this afternoon (commit 820fc14, #23). Plan 4 was brainstormed, designed, ADR'd, and written as an 8-phase implementation plan in the same session. The design doc at [record/designs/2026-04-14-plan4-connections-http-graphql.md](../record/designs/2026-04-14-plan4-connections-http-graphql.md) captures the full narrative. Two ADRs — [0010](../record/decisions/0010-network-host-confinement.md) (network host confinement) and [0011](../record/decisions/0011-var-shim-for-connection-strings.md) (`${VAR}` shim) — capture the atomic decisions. The plan at [record/plans/2026-04-14-jig-runtime-plan4.md](../record/plans/2026-04-14-jig-runtime-plan4.md) breaks Plan 4 into Phase 0 (this doc + handoff) through Phase 7 (example + `smoke-http` + integration + complete handoff), each on its own `feat/plan4-*` branch.

## Decisions made

- **Scope split — Plan 4 = connections + http + graphql; Plan 5 = probes.** Network handler shape locks first; probes consume those handlers at startup, so the consumer settles before the consumer.
- **ADR-0010: network host confinement.** Deny-by-default glob allowlist. `server.security.network.allow` set → explicit; unset + `connections:` declared → allowlist inferred from connection URL hosts; unset + no connections → every host denies. Extends ADR-0009's pattern.
- **ADR-0011: `${VAR}` shim for connection strings.** Config-load pre-pass expands `${VAR}` tokens to `{"env.get":["VAR"]}` wrapped with `cat` when surrounding text is present. Scope is `connections:` only — handler fields keep Mustache (ADR-0007). Access control flows through ADR-0009's env allowlist automatically.
- **URL composition.** Connection holds a base URL; `http.path` appends via Mustache against args. GraphQL ignores path and POSTs to the base URL. Handler `url:` is a one-off escape hatch and must have a declared `network.allow` entry.
- **Handler fields use Mustache; connection values use JSONLogic.** Different layers because handlers are imperative (per-call against args), connections are declarative (compile once, evaluate headers per request against empty context).
- **Response shape.** HTTP: body-only default with 4xx/5xx → `isError`; `response: envelope` opt-in for `{status, headers, body}`. GraphQL: `data` default with `errors:` array auto-detect → `isError`; `response: envelope` for raw `{data, errors, extensions}`.
- **Body shape.** YAML mapping → JSON + auto `Content-Type: application/json`, Mustache on string leaves. `body:` as a string sends raw, author sets content-type.
- **Methods GET/POST/PUT/PATCH/DELETE only in v1.** HEAD and OPTIONS are planned follow-ups per Clay, not rejected.
- **No new runtime dependencies.** Node 22+ stdlib `fetch` + `AbortSignal.timeout` cover the surface.

## What's next

1. **Merge Phase 0** — `gtxt && git pm` on `feat/plan4-doc`. Lands the plan doc plus this handoff.
2. **Open a fresh session, invoke `superpowers:subagent-driven-development`** against the plan file. The plan is self-contained — a subagent only needs to read `record/plans/2026-04-14-jig-runtime-plan4.md` and execute Phase 1 onward.
3. **Phase 1 first — `feat/plan4-interpolate`.** Create `src/runtime/util/interpolate.ts` + `tests/interpolate.test.ts`. Pure function with object walker. See Tasks 1.1–1.9 in the plan.
4. **Each phase is one branch, one PR.** Clay runs `gtxt && git pm` between phases. All five existing gates (`npm run check`, `npm test`, `just smoke`, `just smoke-dispatch`, `just smoke-compute`) plus phase-new tests must pass before commit.
5. **Phase 7 adds `just smoke-http` and lands the Plan 4 complete handoff** naming Plan 5 (probes) as next.

## Landmines

- **Plan doc is 3235 lines — longest yet.** A subagent dispatched for a phase should re-read only its own phase section plus the File Structure and Key Constraints blocks. Feeding the whole plan into every subagent wastes context.
- **Phase 5 changes `invoke()` signature** to accept `ctx: InvokeContext` for compiled-connection threading. Every existing caller must be updated — Task 5.4 Step 3 names the grep (`grep -rn "invoke(" tests/ src/runtime/`) but each call site needs verification. Dispatcher composition tests are the most likely friction point.
- **`connection.headers` evaluates against an empty context** — by design (connections can't see tool-call args). An author who writes `{"var":"args.token"}` in a connection header gets `null`. Handler fields are the place for args; connection headers are the place for env.
- **`url:` on a handler without `connection:`** has no connection headers to merge. The author provides all auth inline via `handler.headers`, and the host must be in `server.security.network.allow` explicitly — the inferred allowlist covers connections only.
- **GraphQL handler always fetches in envelope mode internally** and projects to `data` or `envelope` at the end. A refactor that switches the internal fetch to body mode loses access to status codes on error paths.
- **`.bito.yaml` can disappear between sessions.** Not in Clay's global gitignore; some cleanup step (probably `git up`) removes it. If `bito lint` returns `SKIP: no rules configured`, regenerate `.bito.yaml` from the plugin's session-start hook defaults (template in the plugin cache at `claylo-marketplace/building-in-the-open/1.1.0/.bito.yaml`). Not a blocker — just surprising.
- **`capturing-decisions` skill has a bad shell substitution in its frontmatter** (`${user_config.doc_output_dir}` not resolved at hook expansion time). Invocation fails with `bad substitution`. Workaround: read the skill's SKILL.md directly and follow the MADR process manually. Both ADRs this session used the workaround.
- **`commit.txt` is globally gitignored; `.bito.yaml` is not.** Same as Plan 3's landmine — agent writes `commit.txt`, Clay runs `gtxt` + `git pm`. `.bito.yaml` is not part of this PR's surface.
- **HEAD and OPTIONS are explicitly planned follow-ups, not rejected.** The plan doc's "deferred" section says "Expected in a point release once v1 lands" — don't surface them as "we don't do those" during reviews.
