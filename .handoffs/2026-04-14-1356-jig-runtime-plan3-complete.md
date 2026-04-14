# Handoff: jig runtime — Plan 3 complete

**Date:** 2026-04-14
**Branch:** feat/plan3-complete (pending merge to main)
**State:** Green

> Green = 95/95 tests pass, three smoke recipes (`smoke`, `smoke-dispatch`, `smoke-compute`) green, `npm run check` clean. Plan 3 closes with this branch; Plan 4 (`connections:` / `probes:` / `http:` / `graphql:`) is the next plan to write.

## Where things stand

Plan 3 is done. The jig runtime now carries a full JSONLogic evaluation surface: `json-logic-engine` v5 wrapper at [src/runtime/util/jsonlogic.ts](../src/runtime/util/jsonlogic.ts), 16 built-in helpers across `file` / `env` / `path` / `os` / `time` at [src/runtime/util/helpers.ts](../src/runtime/util/helpers.ts) (per [ADR-0008](../record/decisions/0008-jsonlogic-built-in-helpers.md)), the `compute:` handler at [src/runtime/handlers/compute.ts](../src/runtime/handlers/compute.ts), `when:` guards on dispatch cases (AND-composed with `requires:`), tool-level `transform:` at [src/runtime/util/transform.ts](../src/runtime/util/transform.ts), and ADR-0009 path/env confinement at [src/runtime/util/access.ts](../src/runtime/util/access.ts). A four-action example at [examples/compute-and-guards.yaml](../examples/compute-and-guards.yaml) exercises every surface; `just smoke-compute` and the new stdio integration test round-trip compute + guard-pass + guard-fail + transform.

## Decisions made

- **ADR-0008 implemented as committed.** 16 helpers, namespaced (`file.*`, `env.*`, `path.*`, `os.*`, `time.*`), registered at module import time into the singleton engine. Tests that touch the engine import helpers transitively via `src/runtime/index.ts`.
- **[ADR-0009](../record/decisions/0009-path-and-env-confinement-for-helpers.md) — deny-by-default access controls.** Filesystem allowlist via `realpathSync.native` + `startsWith(root + sep)`. Env allowlist via glob-compiled patterns. Defaults: fs `["."]`, env `JIG_*, HOME, USER, LANG, LC_*, TZ, PATH`. `$VAR` / `${VAR}` / `~` / `.` expansion at `configureAccess()` time — unset vars fail boot.
- **`when:` evaluated before `requires:`, both AND-composed with distinct errors.** Falsy `when` → `dispatch: guard for action "X" did not pass`. Missing `requires` → `dispatch: field(s) "Y" required for action "X"`. Both become `isError` tool results, not JSON-RPC protocol errors.
- **`transform:` lives on `ToolDefinition` only.** One per tool, evaluated against `{ result, args }` where `result` is the handler output JSON-parsed when possible (string fallback). `isError` results pass through. Engine errors during transform → new `isError` with `transform:` prefix.
- **Toolchain on latest: TypeScript 6.0.2, `@types/node` 25.6.0.** `tsconfig.json` carries explicit `"types": ["node"]` — TS 6 no longer auto-includes.

## What's next

1. **Merge Plan 3.** `commit.txt` is written in this branch. Run `gtxt && git pm`.
2. **Open Plan 4** against `record/plans/`. Scope: `connections:` block (credentialed endpoint references), `probes:` (startup-time checks producing cached values), `http:` handler, `graphql:` handler. First design call: where probes fit in the lifecycle — are they startup helpers writing into a `{{probe.NAME}}` surface, or a separate async-refresh track?
3. **Write the Plan 4 decision ADR before implementation.** `connections:` schema and credential resolution (Keychain / env / file) are both new surface area — ADR them before the plan doc commits to a shape.
4. **Plan 7 (build pipeline) reminder.** Helpers resolve relative paths against the *runtime* directory via ADR-0005. In dev that's `src/runtime/`; post-esbuild it's wherever `server.mjs` is installed. Verify the distinction survives bundling during Plan 7.

## Landmines

- **JSON-RPC responses are id-correlated; sequence is not meaningful.** The smoke-compute output shows id=3 arriving before id=2 — this is the protocol working as designed. Integration tests must match by `id` via a `Map`, never by array position. The bug shape to watch for is *consumer code that assumes order*, not the async arrival itself.
- **ADR-0009 defaults reject `$HOME/.config`.** The `home_config` case in `examples/compute-and-guards.yaml` only works because the example declares `server.security.filesystem.allow: [".", "$HOME/.config"]`. Any future example that touches paths outside the runtime directory must extend the allowlist or it silently fails-closed via helper return values (`null`/`false`).
- **Transform JSON-parses result when possible.** A handler returning `"42"` becomes the number 42 in the transform context; `"platform=darwin"` stays a string. The `tryParseJson` fallback in `src/runtime/util/transform.ts:47` is intentional. Authors needing always-string handling do it in the handler.
- **`when:` + `requires:` errors must not be collapsed.** Tests in `tests/handlers.test.ts` verify that failing `when` produces `/guard/i` and failing `requires` produces `/required/i`. A refactor that unifies the error shape will break the composition test.
- **Engine singleton is mutated at import time by `util/helpers.ts`.** Tests that touch the engine directly must import helpers for registration. Integration tests get this transitively through `src/runtime/index.ts`.
- **Compute output stringification matches transform stringification.** Objects JSON-stringify, primitives `String()`, strings verbatim. Pretty-printed JSON is the author's job, not the framework's.
- **`json-logic-engine` treats missing vars as `null`.** Guards like `{"var":"x"}` pass for any non-empty/non-zero value. For *"variable was set"* semantics, use `env.has` / `file.exists` style helpers — don't rely on var truthiness.
- **`commit.txt` is globally gitignored; `.bito.yaml` is not.** Agent writes `commit.txt`; Clay runs `gtxt` + `git pm`. `.bito.yaml` is regenerated from the building-in-the-open plugin's session-start hook and is *not* part of this PR's surface — leave it untracked unless deliberately committing the project's quality-gate config.
