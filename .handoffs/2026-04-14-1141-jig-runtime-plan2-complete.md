# Handoff: jig runtime — Plan 2 complete

**Date:** 2026-04-14
**Branch:** feat/plan2-complete (Phase 5, pre-merge)
**State:** Green

> Green = tests pass, safe to continue. 38/38 tests pass, `tsc --noEmit` clean, both `just smoke` and `just smoke-dispatch` round-trip valid JSON-RPC responses.

## Where things stand

Plan 2 ([`record/plans/2026-04-14-jig-runtime-plan2.md`](../record/plans/2026-04-14-jig-runtime-plan2.md)) is complete through all six phases. The runtime now supports three handler types — `inline`, `exec`, `dispatch` — routed through a central `invoke()` (`src/runtime/handlers/index.ts`). Mustache-style `{{var}}` interpolation works over `tools/call` arguments. Dispatcher tools declare typed flat inputs and per-action `requires`; `tools/list` advertises the action enum. `examples/dispatcher.yaml` + `just smoke-dispatch` give a one-command round-trip probe. Phases 0–4 are already on `main` (PRs #7–11); Phase 5 lives on this branch.

## Decisions made

- **Dispatch takes `invoke` as a parameter.** Dispatch never imports from `handlers/index.ts`; the central `invoke()` passes itself down. Prevents the circular import that would otherwise form and matches the pattern future handlers (http, graphql, compute) should follow.
- **Exec is shell-free** — [ADR-0006](../record/decisions/0006-exec-no-shell-whitespace-argv.md). Rendered commands are whitespace-split into argv and run via `execFile`. No pipes, redirects, or env-var expansion inside the command string.
- **Mustache is minimal** — [ADR-0007](../record/decisions/0007-mustache-minimal-string-only.md). `{{var}}` and `{{a.b.c}}` dot-paths only. Missing values render empty, objects JSON-stringify, unclosed braces stay literal. Logic belongs in JSONLogic (Plan 3).
- **Handler union expanded in two phases.** Phase 3 widened `Handler` to `InlineHandler | DispatchHandler` (required for `toolToInputSchema`'s dispatch narrow). Phase 4 added `ExecHandler` once `validateDispatch` landed. This sequencing is what the plan prescribed; the narrow intermediate state was brief.

## What's next

1. **Merge Phase 5.** `commit.txt` is written on this branch. Clay runs `gtxt` + `git pm`. After merge, `main` carries the full Plan 2 deliverable.
2. **Plan 3 — JSONLogic + `compute` handler + guards + transforms.** Write the plan doc at `record/plans/YYYY-MM-DD-jig-runtime-plan3.md`. Scope from the design doc at [`record/designs/2026-04-13-jig-design.md`](../record/designs/2026-04-13-jig-design.md), §"Templating: two layers": `json-logic-engine` v5 (async operators, function compilation), `compute:` handler (pure, no side effects), `when:` guards on dispatch cases, `transform:` response reshaping. The central `invoke()` switch at `src/runtime/handlers/index.ts:16–24` is where the new `compute` arm lands; the `_never` narrow at the end turns "forgot to wire it" into a compile error.
3. **Plans 4–7** (`connections:` + probes + http/graphql, resources/prompts/tasks, CLI, build pipeline) remain on the roadmap from the design doc — no schedule yet.

## Landmines

- **Async responses arrive out of request order.** Over stdio, an exec-backed `tools/call` completes *after* a sync `tools/list` queued later. Tests that index responses by array position (`responses[N]`) will fail intermittently once any async handler is involved. Match by `response.id` via a `Map` — pattern at `tests/integration.test.ts:177`.
- **Widening `Handler` has consumer ripple.** When Phase 3 widened the union, `src/runtime/index.ts`'s direct `invokeInline(tool.handler)` stopped compiling. Plan 2 hadn't anticipated that; a narrowing guard bridged Phase 3, Phase 4 replaced it with the central `invoke()`. Plan 3 should audit every call site of anything it widens before the widening commit lands.
- **Handler type narrowing in `invoke()` is exhaustive.** The `const _never: never = handler;` line at `src/runtime/handlers/index.ts:25` makes adding a new handler variant into a compile error if it isn't wired into `invoke()`. Preserve the pattern.
- **ToolCallResult needs the index signature.** `[key: string]: unknown` in `src/runtime/handlers/types.ts` is what makes the lean jig shape structurally assignable to the SDK's `CallToolResult`. Any new result type (Plan 5's resource / prompt results) must carry the same signature.
- **Empty-string counts as missing in `requires`.** `dispatch: field(s) "x" required` fires when `args[x]` is `undefined`, `null`, or `""`. Clients that pass empty strings for "this field is absent" will see validation errors — match the pattern or pass `null`.
- **SDK pinned to `2.0.0-alpha.2`.** Stable 2.0 is blocked on client-side release coupling, not technical readiness. `@cfworker/json-schema` is still a direct dep to work around the alpha's bundler. Drop both when 2.0 ships.
- **`just smoke-dispatch` depends on `/bin/echo`, `/usr/bin/awk`, and `jq`.** macOS and Linux both ship the first two; `jq` is `brew install jq`. Any Plan 6 CLI work that changes the smoke path should revisit platform assumptions.
- **`.bito.yaml` and `commit.txt` are globally gitignored.** Agent writes `commit.txt`; Clay runs `gtxt` + `git pm`. `.bito.yaml` is regenerated by the building-in-the-open plugin session-start hook.
