# Handoff: jig runtime — Plan 3 Phases 0–5 landed + ADR-0009

**Date:** 2026-04-14
**Branch:** main
**State:** Green

> Green = main carries six Plan 3 PRs (#16–#21) plus ADR-0009, 94/94 tests pass, both smoke recipes still green, typecheck clean. Phase 6 (example + `smoke-compute` + integration round-trip + Plan 3 complete handoff) is all that remains for Plan 3.

## Where things stand

This session landed Plan 3 Phases 1 through 5 plus an amendment ADR that didn't exist in the plan. The four new runtime surfaces — `json-logic-engine` wrapper, 16 helpers confined behind access controls, `compute:` handler, `when:` guards on dispatch cases, tool-level `transform:` — are all on main and exercised by 94 unit + handler + integration tests. Phase 6 composes them into a single example YAML, a `just smoke-compute` recipe, and an integration test that round-trips compute + guards + transform over stdio. Plan 3 closes when Phase 6 lands.

## Decisions made

- **ADR-0009 — path + env confinement for helpers.** New `src/runtime/util/access.ts` layer enforces allowlisted filesystem roots (`realpathSync.native` + `startsWith(root + sep)` check) and glob-compiled env patterns. Deny-by-default before `configureAccess()` runs. Defaults: fs `["."]`, env `["JIG_*", "HOME", "USER", "LANG", "LC_*", "TZ", "PATH"]`. `$VAR`/`${VAR}`/`~`/`.` expansion happens at configure time, not YAML parse time — unset vars fail closed at boot. Full reasoning in [ADR-0009](../record/decisions/0009-path-and-env-confinement-for-helpers.md).
- **Toolchain bumped to latest on day two.** `typescript ^5.7.0 → ^6.0.2`, `@types/node ^24.0.0 → ^25.6.0`. The plan doc's version pins are floors, not ceilings; on a fresh repo, start on latest. TS 6 no longer auto-includes `@types/*` packages — `tsconfig.json` now carries explicit `"types": ["node"]`.
- **`when:` evaluated before `requires:` on dispatch cases, AND-composed.** `when` is the whole-environment gate ("only on macOS"); `requires` is per-field input. Falsy `when` → `dispatch: guard for action "X" did not pass`. Engine error during `when` → `dispatch: guard for action "X" errored: <msg>`. Both become `isError` tool results, not JSON-RPC protocol errors. Captured inline in Plan 3 Phase 4, not as an ADR.
- **`transform:` lives on `ToolDefinition` only.** One transform per tool; case-level and handler-level transforms explicitly out of scope for v1. Evaluates against `{ result, args }` where `result` is the JSON-parsed handler output (or the raw string when not JSON). `isError` passes through unchanged; engine errors during transform produce new `isError` with a `transform:` prefix.
- **Compute handler result encoding.** Strings pass through verbatim; numbers/booleans/null/undefined → `String(v)`; objects/arrays → `JSON.stringify`. Engine errors → `isError` with `compute:` prefix. Matching `applyTransform`'s rules keeps the two stringifiers uniform.

## What's next

1. **Start Phase 6** on branch `feat/plan3-complete`. Plan 3 lines 1706–2042 are the full spec.
2. **Task 6.1 — `examples/compute-and-guards.yaml`**. The plan's YAML at lines 1719–1802 predates ADR-0009 and needs a `server.security.filesystem.allow` entry for the `home_config` case to work (see Landmines). Expected: one added line — `- "$HOME/.config"` under `server.security.filesystem.allow` alongside `"."`.
3. **Task 6.2 — `just smoke-compute`** recipe (plan line ~1820) piping initialize + tools/call for `summary` and `token_echo` through `src/runtime/index.ts --config examples/compute-and-guards.yaml`. Output should show `[summary] platform=…` and `[token_echo] /Users/…`.
4. **Task 6.3 — stdio integration test** in `tests/integration.test.ts` exercising compute + guard-pass + guard-fail + transform, matching responses by `id` via a `Map` (see Landmines). Plan line ~1847. Note the `${process.platform}` substitution must be done in JavaScript before `writeFileSync` — not via YAML templating (plan line ~1976).
5. **Task 6.4 — Plan 3 complete handoff** under `.handoffs/` via the `curating-context` skill (public mode), naming Plan 4 (`connections:`, `probes:`, `http:`, `graphql:`) as the next plan.
6. **Task 6.5 — commit.txt**. Agent writes; Clay runs `gtxt` + `git pm`.

## Landmines

- **ADR-0009 defaults break the plan's Phase 6 example as written.** Plan lines 1781–1788's `home_config` case guards on `file.is_dir($HOME/.config)`, but the default `filesystem.allow: ["."]` rejects anything outside the runtime directory. Fix: add `- "$HOME/.config"` to the example's `server.security.filesystem.allow`. This is the right demonstration anyway — the example should model declaring the allowlist.
- **The pre-ADR-0009 helpers landed in PR #17 without access controls;** #18 added them. `git log -p 58a2cdb` shows the unbounded helper in history — the controls are in the current tree.
- **Async responses arrive out of request order over stdio** (inherited Plan 2 landmine). Phase 6 Task 6.3's integration test matches responses by `id` via a `Map`, not by array position. Preserve the pattern in any new integration tests.
- **Transform parses result as JSON when possible.** A handler returning `"42"` gets a numeric `result` in the transform context; `"platform=darwin"` gets a string. The `tryParseJson` fallback in `src/runtime/util/transform.ts:47` is intentional — authors needing always-string handling do it in the handler, not the transform.
- **`when:` and `requires:` both compose as AND with distinct error messages.** Tests at `tests/handlers.test.ts` verify that failing `when` produces `/guard/i` and failing `requires` produces `/required/i` — don't collapse the messages into a generic failure or the composition test breaks.
- **TS 6 requires explicit `"types": ["node"]`** in `tsconfig.json` compilerOptions (added Phase 1). Removing it makes every `"node:*"` import specifier blow up with misleading `TS2591: Cannot find name 'node:test'` errors that mimic type-narrowing regressions. Fix the root (missing types), not the downstream symptoms.
- **Helpers resolve relative paths against the *runtime* directory** per ADR-0005, but access controls canonicalize via `realpathSync.native` first. In dev, runtime dir is `src/runtime/` (where `index.ts` lives); post-esbuild (Plan 7), it's wherever `server.mjs` is installed. Plan 7 should verify the path survives bundling.
- **Two duplicate "land plan 3" commits on main** (#14, #15) — harmless artifact from the plan-doc phase. `git log` shows both; the diffs are empty. Not a bug.
- **Subagents may pre-populate `commit.txt`** when dispatched for implementation. Overwrite before running `gtxt`; the subagent's guess is not authoritative.
- **`.bito.yaml` and `commit.txt` stay globally gitignored.** Agent writes `commit.txt`; Clay runs `gtxt` + `git pm`. `.bito.yaml` regenerates from the building-in-the-open plugin's session-start hook.
