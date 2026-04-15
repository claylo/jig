# Plan 7 — prompts + completions + URI templates

**Status:** draft 2026-04-15
**Builds on:** Plan 4 (connections), Plan 6 (resources, static-URI registration, subscribe/unsubscribe, SDK-quarantine pattern), ADR-0009 (path/env confinement), ADR-0010 (network confinement)

## Overview

Three surfaces ship together: a new top-level `prompts:` block, a new top-level `completions:` block, and a URI-template upgrade to Plan 6's `resources:` block. They land as one plan because their completion wiring is shared — prompt arguments and resource-template variables both terminate in the same `completion/complete` MCP method, and shipping half (templates without completion, or prompts without completion) produces a meaningfully broken intermediate state.

`prompts:` declares named templates with arguments. Jig registers each via SDK's `McpServer.registerPrompt`, which auto-wires `prompts/list` + `prompts/get`. Templates are rendered with jig's existing `render()` (same token grammar as tool descriptions).

`completions:` is a top-level block that binds value lists to specific prompt arguments and resource-template variables. Jig wires `completion/complete` low-level via `server.server.setRequestHandler` — same SDK-quarantine pattern Plan 6 used for subscribe/unsubscribe. Prefix-match filtering ships in v1; the `completable()` StandardSchema path is explicitly rejected (see Alternatives).

URI templates are a small upgrade to Plan 6's resource schema: authors declare `template: "queue://jobs/{status}"` instead of a static `uri:`. Jig calls `registerResource` with an SDK `ResourceTemplate` instance; the SDK auto-wires `resources/templates/list` and does RFC 6570 variable extraction on `resources/read`. Templated resources do not carry `watcher:` in v1 — watching a family-of-URIs is unbounded.

## Context

Plan 6 gave jig the read surface (resources) and the update surface (watchers + notifications). Plan 7 closes the author-facing gaps that Plan 6 deferred and adds prompts alongside.

Prompts are MCP's way of exposing canonical instruction templates: "here's the paragraph to include when analyzing a completed job" or "here's how to summarize a queue." Clients (Claude Desktop, Continue, Cline) surface them as slash-commands or quick-actions. They are pure templates — no handler invocation, no upstream call. jig's existing `{{token}}` renderer is the natural fit; we do not adopt a different templating engine.

Completions are MCP's autocomplete surface. A client about to call `prompts/get` with a `depth` argument can first call `completion/complete` to fetch the legal values. Same for resource templates: filling in the `status` variable of `queue://jobs/{status}` can be autocomplete-driven. The spec allows the server to return up to 100 values ordered by relevance, pre-filtered by the partial the client sent. jig's v1 story is **inline value lists declared in YAML**, prefix-filtered. Dynamic completions (handler-backed value sources) are deferred.

URI templates close the loop with the `resources:` surface. Plan 6 registered only static URIs; `resources/templates/list` was a stub. The Plan 6 handoff explicitly flagged that templates + completions must ship together: a template without completion is declared-but-unfillable; a completion without a template ref has nothing to complete. Plan 7 lands both.

The master design doc [`record/designs/2026-04-13-jig-design.md`](2026-04-13-jig-design.md:60-75,192-211) specifies the shapes this plan locks in.

## Approach

### Schema additions

Two new top-level blocks and one upgrade:

```yaml
prompts:
  - name: analyze_job                  # required; unique across prompts
    description: Analyze a completed job
    arguments:
      - name: jobId
        description: The job ID to analyze
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: |
      Analyze job {{jobId}} at {{depth}} depth.
      Connection: {{probe.linear_self.name}}

completions:
  prompts:
    analyze_job:
      depth: [summary, detailed]
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed, failed, cancelled]

resources:
  - template: queue://jobs/{status}    # NEW: alternative to `uri:`
    name: Jobs by status
    description: List of jobs filtered by state
    mimeType: application/json
    handler:
      exec: "./handlers/list-jobs --status {{status}}"
    # `watcher:` not permitted on templated resources in v1
```

**Validation rules** (`src/runtime/prompts.ts`, additions to `src/runtime/resources.ts`, new `src/runtime/completions.ts`):

- `prompts:` is undefined OR an array.
- Each prompt entry is a mapping with:
  - `name` — required non-empty string; unique across `prompts:`.
  - `description` — optional string.
  - `arguments` — optional array; each entry is `{ name: string, description?: string, required?: boolean }`. Argument names unique within the prompt.
  - `template` — required non-empty string.
- `completions:` is undefined OR a mapping with optional `prompts:` and/or `resources:` submaps.
  - `completions.prompts.<promptName>.<argName>: string[]` — array of ≥1 strings. Referenced `promptName` must exist in `prompts:`; referenced `argName` must exist in that prompt's `arguments:`.
  - `completions.resources."<templateString>".<varName>: string[]` — array of ≥1 strings. `templateString` must match a resource declared with `template:` (exact string match, including scheme and curly braces); `varName` must be one of the `{vars}` in that template.
- `resources:` entry schema adds `template` as an alternative to `uri`. Exactly one of the two must be present per resource entry. A `template:` resource MUST NOT carry a `watcher:` key.
- Unknown keys rejected at every level (matches Plan 4/5/6 convention).

Cross-reference validation runs after individual block validation — the `completions:` validator needs the parsed `prompts:` and `resources:` to verify refs. Defect in either referenced block fails first; completions validation fails with a clear "prompt `foo` has no argument `bar`" message when refs don't match.

**Type definitions** (`src/runtime/config.ts`):

```typescript
export interface PromptArgumentSpec {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptSpec {
  name: string;
  description?: string;
  arguments?: PromptArgumentSpec[];
  template: string;
}

export type PromptsConfig = PromptSpec[];

export interface CompletionsConfig {
  prompts?: Record<string, Record<string, string[]>>;   // promptName -> argName -> values
  resources?: Record<string, Record<string, string[]>>; // templateString -> varName -> values
}

// ResourceSpec gains a template alternative:
export type ResourceSpec =
  | (ResourceSpecStatic & { uri: string; template?: never })
  | (ResourceSpecTemplated & { template: string; uri?: never; watcher?: never });
```

### Prompt registration

`src/runtime/prompts.ts` exposes a single `registerPrompts(server, config.prompts, ctx)` that mirrors `registerResources`. For each prompt:

1. Build a JSON Schema from `arguments` — object with per-argument string properties, each carrying `description`, and a `required: []` array. (Same shape `toolToInputSchema` produces, minus the typed-field logic — prompt arguments are wire-level strings per the MCP spec.)
2. Bridge via `fromJsonSchema(...)` to a `StandardSchemaWithJSON`. Confirmed from SDK source: `promptArgumentsFromStandardSchema` reads `description` from `prop.description` and `required` from the `required: []` array of the schema produced by `standardSchemaToJsonSchema` — round-trips cleanly through `fromJsonSchema`.
3. Call `server.registerPrompt(name, { description, argsSchema }, cb)` where `cb` receives the parsed args map. Inside `cb`, render `spec.template` via `render(spec.template, { ...args, probe: ctx.probe })` and return `{ messages: [{ role: "user", content: { type: "text", text: rendered } }] }`.

`registerPrompt` auto-wires `prompts/list` + `prompts/get` and auto-advertises `capabilities.prompts.listChanged`. No low-level reach required for prompts themselves.

### URI-templated resources

`src/runtime/resources.ts` gains a branch in `registerResources`:

```typescript
if ("template" in spec) {
  const template = new ResourceTemplate(spec.template, { list: undefined });
  server.registerResource(spec.name, template, metadata, async (uri, variables) => {
    const args = { ...variables, probe: ctx.probe };
    const result = await invoke(spec.handler, args, ctx);
    return toReadResourceResult(uri, result, spec.mimeType);
  });
}
```

The SDK's `ResourceTemplate` constructor requires the `list` key be explicitly present (TypeScript-enforced no-forgetting rule — passing `{}` is a type error). v1 passes `list: undefined`, meaning templated resources do not surface on `resources/list`. They do appear on `resources/templates/list`, which the SDK auto-wires.

`registerResource` with a template instance calls the same `setResourceRequestHandlers` initializer the static branch does — no new low-level wiring.

### Completion handler

The SDK has no `registerCompletion` method. Its `completion/complete` handler auto-wires only when prompts use `completable()`-wrapped schemas or resource templates declare a `complete` map in their constructor — both of which bake the completion values into the SDK's internal Zod tree. Jig deliberately skips both paths (see Alternatives) and wires `completion/complete` low-level in `server.ts`:

```typescript
lowLevel.setRequestHandler("completion/complete", async (req) => {
  const { ref, argument } = req.params;
  const values = lookupCompletionValues(completionsIndex, ref, argument.name);
  if (values === null) return EMPTY_COMPLETION_RESULT;
  const filtered = values
    .filter((v) => v.toLowerCase().startsWith(argument.value.toLowerCase()))
    .slice(0, 100);
  return { completion: { values: filtered, total: values.length, hasMore: filtered.length < values.length } };
});
```

`completionsIndex` is a pre-built map from `(refType, refKey, argName)` to `string[]`, constructed at boot by `buildCompletionsIndex(config.completions)`. The wire-level `ref.type` discriminant (`ref/prompt` | `ref/resource`) routes the lookup. Prefix match is case-insensitive; falling off the known-values list returns the SDK's `EMPTY_COMPLETION_RESULT` sentinel — same behavior the SDK itself uses when it can't find a matching prompt or template.

**Capability advertisement:** The SDK's auto-wiring paths do advertise `capabilities.completions: {}` when they kick in. Since jig bypasses both, we register the capability ourselves in `wireCompletions()` (called alongside `trackSubscriptions` from `src/runtime/index.ts`) via `server.server.registerCapabilities({ completions: {} })`, before `server.connect()`.

### Summary of call order (`src/runtime/index.ts`)

```
registerTools(server, config.tools, ctx)
registerResources(server, config.resources, ctx)   // static + templated
registerPrompts(server, config.prompts, ctx)
trackSubscriptions(server)                          // Plan 6; gated on config.resources
wireCompletions(server, config.completions)        // Plan 7; gated on config.completions
startWatchers(server, config.resources)             // Plan 6
server.connect(transport)
```

Capabilities advertised by the end of this sequence:
- `tools.listChanged: true` (from `registerTool`)
- `resources.listChanged: true` + `resources.subscribe: true` (from `registerResource` + `trackSubscriptions`)
- `prompts.listChanged: true` (from `registerPrompt`)
- `completions: {}` (from `wireCompletions`)

### Phasing (details live in the plan doc)

Anticipated phase shape — the plan doc carves the exact boundaries:

1. `prompts:` schema + validator (config.ts, prompts.ts scaffolding, no registration).
2. Prompt registration + render wiring (prompts.ts full; `registerPrompt` hooked via server.ts adapter).
3. URI-templated resources (resources.ts branch; `ResourceTemplate` adapter in server.ts).
4. `completions:` schema + validator + cross-reference checks (completions.ts).
5. Completion handler wiring (wireCompletions in server.ts; ref-type routing; prefix filter).
6. Example YAML + `just smoke-prompt` + integration test + handoff.

## Out of scope (deferred to later plans)

- **Dynamic completions** — handler-backed value sources (`completions: { prompts: { analyze_job: { jobId: { handler: { exec: "./list-job-ids" } } } } }`). The shape is forward-compatible (swap `string[]` for a union with `{ handler: Handler }`), but the SDK quarantine, invoke-dispatch, and rate-limit stories all need design attention. v1 ships inline value lists only.
- **`completable()` StandardSchema wrapping** — see Alternatives. Rejected.
- **Prompt handlers** — prompts that dispatch through a tool-style handler to produce dynamic messages. Current shape is template-only; a future plan can extend `PromptSpec` with an optional `handler:` alternative to `template:`.
- **Prompt message sequences** — multiple `{role, content}` entries per prompt, or `EmbeddedResource` content blocks. v1 produces one user-role text message per prompt.
- **Completion for non-string prompt args** — the MCP spec's `argument.value` field is `string`; non-string completions would require a type-aware bridge. Deferred.
- **Watchers on templated resources** — watching `queue://jobs/{status}` implies watching every concrete materialization. Unbounded. Authors who need live updates on a parameterized resource can declare N static resources instead.
- **`resources/list` enumeration of templated resources** — the SDK supports a `list` callback that materializes a template to concrete URIs for the list response. v1 passes `list: undefined`; templated resources appear only on `resources/templates/list`.
- **Blob content, webhook watchers** — Plan 6 carryovers, still deferred.
- **Task state machines** — Plan 8.

## Alternatives considered

### Use the SDK's `completable()` path

Wrap StandardSchema fields with `completable(schema, completer)` so the SDK auto-wires `completion/complete`. Similar approach with `ResourceTemplate`'s `complete` map for template variables.

**Rejected** for three reasons. (a) SDK quarantine: `completable` would leak SDK-specific schema decoration into `src/runtime/prompts.ts`, adding a second file (besides `server.ts`) that imports directly from `@modelcontextprotocol/server`. The Plan 6 exception list grows; the invariant erodes. (b) Uniformity: prompt-arg completion and resource-template-var completion are two totally different SDK paths (`completable()` vs constructor map) with different lookup semantics. Our low-level handler treats both the same — one index, one lookup function. (c) Forward-compatibility: dynamic completions (deferred but planned) need a runtime handler anyway. Shipping v1 with `completable()` means rewriting the entire surface when dynamic arrives. Low-level from day one keeps the data flow consistent.

### Flat array for `completions:` block

```yaml
completions:
  - ref: { type: prompt, name: analyze_job, argument: depth }
    values: [summary, detailed]
```

**Rejected** in favor of the nested-by-ref shape. The flat form matches the wire protocol exactly, which is a readability win for spec-readers but a loss for YAML authors who group completions by what they complete. The nested form also makes cross-reference validation errors land on precise YAML paths (`completions.prompts.analyze_job.depth`) rather than array indices.

### Detect URI templates via `{` presence in the `uri:` field

Keep a single `uri:` key and infer template-ness from whether it contains `{` / `}`.

**Rejected** for Clay's "explicit over implicit, no hidden defaults" design principle. An author who writes `uri: "config://{{probe.team_id}}/settings"` expects token interpolation at registration time (a static URI), not an RFC 6570 template. Separating `uri:` (static, token-interpolated at boot) from `template:` (dynamic, RFC 6570-extracted per read) makes the two modes unambiguous.

### One plan per surface (prompts / completions / URI templates as three plans)

**Rejected.** Completion targets both prompts and resource templates. Shipping prompts without completion means every prompt with a constrained-value argument (role: summary vs detailed; status: pending vs active) surfaces no client-side autocomplete. Shipping templates without completion means every templated resource is declared-but-unfillable. The three must land together.

### Use `completable()` for prompts only; low-level for templates

A hybrid: let `registerPrompt` auto-wire via `completable()` since it's the happy path, and go low-level only for template vars.

**Rejected.** The SDK's `completion/complete` handler is a single dispatcher — you can't partially-wire it. Either the SDK owns the handler (requires `completable()` everywhere) or jig owns it (requires low-level for everything). Mixing registration surfaces where the SDK auto-wires the completion branch for prompts and we override the resource branch means either (a) the SDK's handler runs first and our override is dead code, or (b) we register ours first and the SDK's `setCompletionRequestHandler` throws on the duplicate. Either way: all-in-one, not mix-and-match.

## Consequences

### Good

- Authors close the MCP triad: tools (POST), resources (GET), prompts (template). Plus completions for every parameterized surface.
- URI templates make the resource model expressive enough for real upstreams — one `queue://jobs/{status}` declaration replaces five static resources.
- Low-level completion handler gives jig a single place to swap inline lists for dynamic handler-backed completions in a future plan. No SDK surgery required.
- `render()` reuse means the template grammar (`{{var}}`, `{{probe.name}}`) is identical across tool descriptions, resource handlers, and now prompt templates. Zero cognitive load for authors.
- Shape extensions are additive: `prompts:` adds a block, `completions:` adds a block, `resources:` gains a `template:` key. No existing YAML breaks.

### Bad

- Second SDK-quarantine exception in `server.ts`. Plan 6 introduced `server.server.setRequestHandler` for subscribe/unsubscribe; Plan 7 adds `completion/complete`. The rule "every direct SDK import lives in `server.ts`" still holds, but `server.ts` now has three low-level request handlers distinct from the high-level `McpServer` path. Future plans that add their own low-level handlers will grow this section; we may eventually want a `lowLevelHandlers.ts` extraction. Not done in Plan 7.
- Completion values are static at boot. YAML reload requires a process restart to pick up new values. Same reload story as tools/resources/prompts — not a Plan 7 problem, but users authoring rapidly-evolving completion lists will feel it.
- `completions:` cross-reference validation runs after individual-block validation, which means a typo in a prompt name surfaces *both* a "prompt not found" error from completions *and* whatever validation error tripped prompts. The compound error is more noise than a single clean message; acceptable tradeoff for validator simplicity.
- Templated resources cannot declare watchers. Authors who want a live-updating parameterized resource must enumerate static resources, losing the template's DRY benefit. Matches the SDK's model — templates are a family, watchers target a single URI — but authors may hit the wall.

### Neutral

- No new runtime dependencies. `ResourceTemplate` is an SDK export; `fromJsonSchema` is already used for tools; `render()` is jig-owned.
- The nested `completions:` shape is forward-compatible with dynamic completions — a future plan extends `string[]` to `string[] | { handler: Handler }` with discriminated runtime dispatch.
- Prefix matching is case-insensitive. Case-sensitive or fuzzy matching (Levenshtein, subsequence) is a future refinement; the SDK does no filtering, so jig controls the policy.
- `capabilities.completions: {}` advertises zero sub-features. The spec currently defines no sub-capabilities on the completions object, so `{}` is correct today and extensible tomorrow.

## Related decisions

- **Plan 6 design doc** — the `server.server.setRequestHandler` pattern for SDK-quarantine-bounded low-level wiring. Plan 7 reuses it for `completion/complete`.
- **Plan 5 design doc** — `InvokeContext.probe` is available to prompt template rendering (`{{probe.name}}`) just as it is in tool descriptions and resource handlers.
- **Master design doc** (lines 60-75, 192-211) — declares the top-level YAML shape; Plan 7 implements the prompts + completions slots.
- **ADR-0009 (path confinement)** — exec-backed resource-template handlers (`exec: "./handlers/list-jobs"`) respect the filesystem allowlist.
- **ADR-0010 (network confinement)** — http/graphql-backed resource-template handlers respect the network allowlist.
