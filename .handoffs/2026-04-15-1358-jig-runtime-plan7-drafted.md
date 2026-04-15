# Handoff: jig runtime — Plan 7 drafted (prompts + completions + URI templates)

**Date:** 2026-04-15
**Branch:** `chore/plan7-doc` (this commit bundles the plan doc + this handoff; merge via `gtxt && git pm`)
**State:** Green

> Green = main carries Plan 6 complete and the Plan 7 design doc (#50). This commit lands the Plan 7 plan doc. No code changes yet. Phase 1 execution starts in a fresh session.

## Where things stand

Plan 7 is fully scoped and ready to execute. Design doc ([`record/designs/2026-04-15-plan7-prompts-completions.md`](../record/designs/2026-04-15-plan7-prompts-completions.md), 266 lines) landed on main as #50. Plan doc ([`record/plans/2026-04-15-jig-runtime-plan7.md`](../record/plans/2026-04-15-jig-runtime-plan7.md), 2685 lines) lands with this commit. Six phases, 30 tasks, 9-gate suite after Phase 6 (adds `just smoke-prompt` to the existing 8). Zero source changes on this branch — documentation only.

## Decisions made

- **Three surfaces land in one plan, six phases.** prompts + completions + URI-template upgrade to resources. Rationale: completion wiring is shared — prompt-arg refs and resource-template-var refs both hit one `completion/complete` handler. Shipping any surface without the others produces a declared-but-unfillable state. See design doc *Overview* + *Context*.
- **Completion handler goes low-level via `server.server.setRequestHandler`.** SDK's `completable()` + `ResourceTemplate.complete` map paths rejected. Keeps SDK imports quarantined to `server.ts`, routes both ref types through one dispatcher, forward-compatible with future dynamic completions. See design doc *Alternatives considered*.
- **Explicit `template:` key on resources (not `{`-sniffing magic).** Mutually exclusive with `uri:`. Templated resources MUST NOT carry `watcher:`. Matches "explicit over implicit, no hidden defaults."
- **Nested-by-ref `completions:` YAML shape** (not flat array). Groups by what's being completed; cross-reference errors land on precise YAML paths (`completions.prompts.analyze_job.depth`).
- **`wireCompletions` as a method on `JigServerHandle`**, not a free function. Differs from design doc's wording but symmetric with `trackSubscriptions`. Subagent judgment call during plan-doc drafting.
- **`buildCompletionsIndex` placed in `server.ts`.** Pure data-transformation function; could equally live in `completions.ts`. Subagent's SDK-quarantine rationale doesn't quite apply (no SDK deps), but placement is fine.

## What's next

1. **Pre-flight scan the plan doc before dispatching Phase 1.** Every Plan from 4 onward caught errors. Plan 7 has at least two known defects to fix at scan time:
   - Phase 5 Task 5.1 Step 3 — the `completion/complete` handler casts `req.params as { ref: ...; argument: ... }`. Redundant: SDK's `setRequestHandler` generic infers the request shape from the method literal (see Plan 6's `resources/subscribe` handler in `src/runtime/server.ts:276` — no cast). Drop the cast.
   - Verify every SDK import name against actual `@modelcontextprotocol/server` exports (`GetPromptResult`, `RegisteredPrompt`, `ResourceTemplate`, `ReadResourceTemplateCallback`). The plan-doc landmine "Plan doc code blocks have defects" at the tail enumerates the scan steps.
2. **Start Phase 1 in a fresh session** via `superpowers:subagent-driven-development`. Branch: `feat/plan7-prompts-schema`. First artifact: `src/runtime/prompts.ts` scaffolding + `validatePrompts` + types in `config.ts` + `tests/prompts.test.ts`. See plan doc lines 140-568.
3. **Plan 7 phase branches** in order: `feat/plan7-prompts-schema` → `-prompts-registration` → `-uri-templates` → `-completions-schema` → `-completions-wiring` → `-complete`. Each lands as one PR via `gtxt && git pm`.
4. **Plan 8 (tasks + state machines)** after Plan 7 merges. Largest v1 surface; strict requirements in `record/designs/2026-04-13-jig-design.md`.

## Landmines

- **Plan 7 has its own *Landmines* section** at the plan-doc tail (`record/plans/2026-04-15-jig-runtime-plan7.md:2665-2685`). Eight bullets covering SDK surface traps: `fromJsonSchema` round-trip preserving `required[]` and per-prop `description`; `ResourceTemplate` constructor requiring explicit `list: undefined`; `completion/complete` ref.uri matching the template string exactly (no normalization); 100-value silent cap after prefix filter; `wireCompletions` MUST run before `server.connect`; `prompts.ts` + `completions.ts` MUST NOT import from `@modelcontextprotocol/server`; `registerPrompt` callback signature splits on `argsSchema` presence (same pattern as `registerTool`); `extractTemplateVars` handling RFC 6570 modifiers. Read that section before Phase 1.
- **SDK-quarantine exception count grows to three.** Plan 6 introduced `server.server.setRequestHandler` for subscribe/unsubscribe; Plan 7 adds `completion/complete`. The rule "every direct SDK import lives in `server.ts`" still holds — all three low-level handler calls happen inside `server.ts` — but a future `src/runtime/lowLevelHandlers.ts` extraction may be warranted. Not in Plan 7.
- **Nine gates must pass before Phase 6 commit:** `npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt`. Phase 6 adds `smoke-prompt` as the ninth gate.
- **Handoff bundled with the plan-doc commit, not a separate PR.** Clay asked for this explicitly. Breaks from Plan 4/5/6 where handoffs rode on Phase N execution PRs. Rationale: the handoff is transitioning out of this session before execution begins, so it pairs with the plan doc (which defines what the next session does), not with a completed-phase commit.
- **Design + plan weight is 2951 lines.** Per `memory/feedback_handoff_before_executing_drafted_plans.md`, that's over the handoff-before-execution trigger. Phase 1 runs in a fresh session, not in continuation of the drafting session.
