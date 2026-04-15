# Handoff: jig runtime — Plan 6 scoped and drafted

**Date:** 2026-04-14
**Branch:** main
**State:** Green

> Green = Plan 5 is fully merged on main; all eight gates (`npm run check`, `npm test`, `just smoke`/`smoke-dispatch`/`smoke-compute`/`smoke-http`/`smoke-probe`) pass. Plan 6 design doc + plan doc are drafted locally but not yet committed — next actions are mechanical commits, not recovery.

## Where things stand

The Plan 5 handoff listed "resources + watchers, prompts, completions, tasks (state machines)" as one Plan-6-sized block. This session carved that into three plans and drafted Plan 6 (resources + watchers) in full. Two docs are in the working tree, uncommitted:

- `record/designs/2026-04-14-plan6-resources-watchers.md` (252 lines)
- `record/plans/2026-04-14-jig-runtime-plan6.md` (2133 lines, 6 phases)

`commit.txt` is already staged at the repo root for the design-doc PR (matches Plan 5's `docs:` → `chore:` cadence). Plan 6 implementation has not started — execution happens in the next session via subagent-driven-development (one subagent per phase).

## Decisions made

- **Split Plan 6.** What the Plan 5 handoff framed as one plan becomes three: Plan 6 (resources + watchers), Plan 7 (prompts + completions — cohesive because completion backs both prompt args and resource-template args), Plan 8 (tasks + state machines — largest surface, first real user has strict needs per master design doc).
- **Static URIs only in Plan 6.** URI templates deferred to Plan 7 because template variable completion belongs with the `completions:` surface; shipping half produces an awkward state.
- **Text content only.** `ReadResourceResult.contents[].blob` deferred until a real user asks; needs a design decision about encoding placement.
- **Polling + file watchers ship; webhook deferred.** Webhook watcher requires an inbound HTTP listener; jig is stdio-only in v1. Schema is forward-compatible via union extension.
- **Subscribe/unsubscribe wire via the low-level `server.server.setRequestHandler`.** The SDK's high-level `McpServer` class does not wire them. The SDK-quarantine invariant holds because the crossing stays in `src/runtime/server.ts`.
- **Watchers run unconditionally; subscription gate is at emit-time.** Simpler state machine, moot for single-client stdio. Revisit if/when HTTP transport lands (Plan 9+).
- **Single-client subscription state = `Set<string>`.** Process-scoped, zero machinery. Multi-client HTTP transport will need per-session tracking.
- **Pre-flight defect scan fixed three plan-doc defects before commit:**
  1. `Protocol.setRequestHandler<M extends RequestMethod>` takes a method **string**, not a Zod schema (sdk 2.x vs 0.x). Method-literal inference gives the handler the right request shape via `RequestTypeMap[M]`. See `node_modules/@modelcontextprotocol/server/dist/index-Bhfkexnj.d.mts:9493`.
  2. jig's `exec:` handler runs `execFile` — `${VAR}` shell expansion is literal text. The example YAML uses a hard-coded `/tmp/jig-plan6-state.txt` and a filesystem-allowlist entry; no env-var indirection. See `src/runtime/handlers/exec.ts:27`.
  3. Smoke recipes should stay synchronous (echo-pipe pattern from `smoke-probe`). Mid-run mutation + async-observe belongs in `tests/integration.test.ts`, not in `justfile` recipes.

## What's next

1. **Land the design doc.** `commit.txt` is staged. Run `gtxt && git pm` — opens a `docs:` PR matching Plan 5's cadence (see claylo/jig#34 for shape). Merges design doc to main.
2. **Write Phase 0 `commit.txt` for the plan doc, then commit it.** Use the message block in `record/plans/2026-04-14-jig-runtime-plan6.md` Phase 0 Task 0.1 Step 1. Stage only `record/plans/2026-04-14-jig-runtime-plan6.md`. Run `gtxt && git pm`.
3. **Dispatch Phase 1 via subagent-driven-development.** Invoke `superpowers:subagent-driven-development`, then spawn one general-purpose subagent per phase in sequence. Provide the full phase text from the plan doc (don't make the subagent read the file). Phase sequence and branch names per `record/plans/2026-04-14-jig-runtime-plan6.md` File Structure section. Each phase lands as its own PR after `gtxt && git pm`; next phase does not start until the prior merges.

## Landmines

- **Uncommitted `commit.txt` at repo root.** It's for the design doc. Do not overwrite before running `gtxt`. `commit.txt` is globally gitignored and `gtxt` removes it on successful commit.
- **Agent tool dispatch failed in this session with `"This model does not support the effort parameter"`.** Three parallel general-purpose Agent calls errored immediately. Research was done inline instead. Before dispatching the Phase 1 implementer subagent, verify Agent spawning works — if the same error recurs, pass an explicit `model: "sonnet"` parameter. The parent model in this session is `claude-opus-4-6[1m]`; the effort parameter may not thread through to spawned general-purpose agents without an explicit override.
- **McpServer auto-wires `resources/list` + `resources/templates/list` + `resources/read` + `capabilities.resources.listChanged: true` on first `registerResource` call.** Phase 3's `trackSubscriptions()` adds `resources.subscribe: true` via `registerCapabilities()`; `mergeCapabilities` deep-merges so the `listChanged` flag is preserved. `registerCapabilities()` MUST run before `server.connect()` — it throws `AlreadyConnected` otherwise.
- **Watcher `persistent: false` is required on `fs.watch`.** Without it, the handle keeps the event loop alive past stdin close. Integration tests will appear to hang.
- **Phase 2 handler `isError: true` translates into a thrown `Error`.** The SDK's Protocol wraps thrown errors as JSON-RPC `InternalError` responses, preserving the message text. The Phase 2 test asserts `assert.match(readResp.error!.message, /read failed/)` — this form is flexible enough to pass regardless of error-code wrapping.
- **Polling watcher establishes a baseline hash on its FIRST tick (immediately at boot), no emit.** Subsequent ticks compare against the baseline. Authors expecting the first tick to fire an update will be surprised; design-doc Alternatives-considered explains.
- **Plan docs have defects; pre-flight scan before dispatching Phase 1.** This session caught 3 in Plan 6. The repeatable scan from Plan 5's handoff: check every `import` in code blocks against actual module exports, verify cross-phase ordering (types referenced in phase N must be introduced by phase N or earlier), verify assertion expectations against handler behavior. The Plan 6 plan doc's final "Landmines" section carries three candidates worth re-scanning before Phase 3.
- **`.config/bito.yaml` drops from the SessionStart hook.** Untracked by design; leave out of staging.
- **Specific-path `git add`** — never `-A`. Plugin hooks land files mid-session.
- **Handoff filename is in Eastern Time.** Run `TZ="America/New_York" date +"%Y-%m-%d-%H%M"` immediately before writing; hook enforces this at commit.
