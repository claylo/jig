# Handoff: jig runtime — Plan 7 complete, Plan 8 next

**Date:** 2026-04-15
**Branch:** `feat/plan7-complete` (PR pending; main carries Plan 7 after merge)
**State:** Green

> Green = 236/236 tests pass. All 9 gates green. Phase 6 shipped: example YAML, smoke-prompt recipe, end-to-end integration test, handoff.

## Where things stand

Plan 7 is complete. All six phases landed across one session: schema + validator (#52), registration + `prompts/list`/`prompts/get` (#53), URI-templated resources (#54), completions schema + cross-ref validator (#55), `wireCompletions` + `completion/complete` handler (#56), and Phase 6 (this commit — `feat/plan7-complete`). The demonstrable artifact (example YAML, `smoke-prompt` recipe, end-to-end integration test) exercises all three Plan 7 surfaces in a single hermetic run. Plan 7 doc: `record/plans/2026-04-15-jig-runtime-plan7.md`.

## What Plan 7 delivered

- **`prompts:` block** — named prompt templates with typed arguments (`PromptArgumentSpec`/`PromptSpec`/`PromptsConfig`). Registered via `registerPrompts` in `src/runtime/prompts.ts`; `prompts/list` and `prompts/get` auto-wired by the SDK. `prompts/get` Mustache-renders the template with provided args.
- **`completions:` block** — value lists bound to prompt arguments and template resource variables (`CompletionsConfig`). Cross-reference validator at parse time. `buildCompletionsIndex` builds the lookup; `wireCompletions` registers `completion/complete` via low-level `server.server.setRequestHandler`. Prefix filter is case-insensitive; values cap at 100; `hasMore` signals truncation.
- **URI-template resources** — `template:` key on `resources:` entries (`ResourceSpecTemplated`). Registered via `new ResourceTemplate(str, { list: undefined })`. Template variables extracted from RFC 6570 syntax (including modifier support) and passed to `invoke`; merged with probe context at read time.
- **MCP methods added:** `prompts/list`, `prompts/get`, `resources/templates/list`, `resources/read` with template variable extraction, `completion/complete` with `ref/prompt` and `ref/resource` routing.

## Key decisions

- **SDK quarantine held.** `src/runtime/prompts.ts` and `src/runtime/completions.ts` import zero symbols from `@modelcontextprotocol/server`. All three low-level handler sites (subscribe, unsubscribe, `completion/complete`) live in `src/runtime/server.ts`. The rule: every direct SDK surface crossing lives in `server.ts` — the single edit point for SDK upgrades.
- **`PromptCallback` cast.** `PromptCallback<StandardSchemaWithJSON>` fails TypeScript's conditional-type resolution at the cast site where `ToolCallback<StandardSchemaWithJSON>` succeeds. Fallback: `cb as Parameters<typeof server.registerPrompt>[2]`. Lives in `src/runtime/server.ts`.
- **`ResourceTemplate` requires explicit `{ list: undefined }`.** TypeScript enforces the `list` key; `new ResourceTemplate(str, {})` is a compile error. Always write `{ list: undefined }`.
- **`wireCompletions` uses `server.server.setRequestHandler` directly** — the only way to reach `completion/complete` before the SDK exposes a high-level path. This is the third low-level handler in `server.ts` (after subscribe/unsubscribe from Plan 6).
- **`fromJsonSchema` bridges argsSchema.** Converts the JSON Schema built by `buildArgsSchema` into the `StandardSchemaWithJSON` the SDK requires for `registerPrompt`. The `required: string[]` array must live at the schema root, not per-property, for `prompts/list` to surface `required: true` on arguments.
- **`hasMore` formula:** `capped.length < allMatching.length` (cap-truncation semantics). Two-local pattern (`allMatching` / `capped`) is the canonical shape for paginated/capped responses in this codebase.
- **`invokeInline` does NOT Mustache-render.** `handler: { inline: { text: "{{var}}" } }` passes text verbatim. Use `exec:` for any handler that needs template-variable interpolation. This was the Phase 6 pre-flight correction: the plan's integration test spec'd `inline: { text: "jobs-status={{status}}" }` and `assert.equal`; corrected to `exec: "echo jobs-status={{status}}"` and `assert.match(..., /jobs-status=active/)`.

## Boot call order (final)

`registerTools` → `registerResources` (static + templated) → `registerPrompts` → `trackSubscriptions` → `wireCompletions` → `startWatchers` → `server.connect`

`wireCompletions` MUST precede `server.connect` — handlers must be registered before the `initialize` handshake completes.

## Nine gates

`npm run check && npm test && just smoke && just smoke-dispatch && just smoke-compute && just smoke-http && just smoke-probe && just smoke-resource && just smoke-prompt` — all green.

## What's next

1. **Plan 8 — tasks + state machines.** Largest v1 surface: MCP task lifecycle, elicitation, idempotency, state machine YAML. Requirements in `record/designs/2026-04-13-jig-design.md`. Fresh session recommended — Plan 7 is complete and clean.
2. **Plan 9 — CLI.** Config scaffold, init command, validate command.
3. **Minor follow-up (not Plan 8 scope):** document `inline` vs `exec` Mustache divergence in `src/runtime/handlers/inline.ts`. Future plan authors writing `inline: { text: "{{var}}" }` will silently not render; `exec:` is the path.

## Landmines (carry forward from Plan 7)

- **SDK quarantine.** `prompts.ts` and `completions.ts` must import zero symbols from `@modelcontextprotocol/server`. Pre-flight check: `grep -r "@modelcontextprotocol/server" src/runtime/prompts.ts src/runtime/completions.ts` must return nothing.
- **`ResourceTemplate` explicit `list: undefined`.** `new ResourceTemplate(str, {})` is a TypeScript compile error. Always `{ list: undefined }`.
- **`completion/complete` ref.uri matches template string exactly.** The client sends the literal template string with curly braces (`queue://jobs/{status}`), not a concrete URI. The completions index is keyed on the raw template string. No percent-encoding normalization in v1.
- **Completion values cap at 100 silently.** Cap applies to the filtered set; `hasMore` signals truncation. Clients that don't surface `hasMore` will silently miss values 101+.
- **`wireCompletions` must run before `server.connect`.** See boot call order above. Swapping order means `completion/complete` is never advertised.
- **`invokeInline` does NOT Mustache-render.** Use `exec:` for template variable interpolation. This burned the plan's own integration test spec — caught in pre-flight.
- **`extractTemplateVars` must handle RFC 6570 modifiers** (`+`, `#`, `.`, `/`, `;`, `?`, `&`) when extracting variable names from template strings. Current implementation strips these; verify when adding new RFC 6570 operator variants.
- **Pre-dispatch scan pattern worked again (Phase 6).** Pre-flight caught the inline/exec defect in the plan's integration test before dispatch. Continue scanning plan code blocks before executing — every plan from 4 onward caught errors this way.
