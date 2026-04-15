# Plan 6 — resources + watchers

**Status:** draft 2026-04-14
**Builds on:** Plan 4 (connections, http, graphql), Plan 5 (probes, `InvokeContext.probe`), ADR-0009 (path/env confinement), ADR-0010 (network confinement)

## Overview

Resources are boot-registered, content-bearing endpoints the client reads via `resources/list` + `resources/read`. Authors declare them in YAML under a new top-level `resources:` block. Each resource reuses the existing tool handler types (inline / exec / http / graphql / compute / dispatch) to produce its text; jig translates the handler's `ToolCallResult` into the SDK's `ReadResourceResult` at request time.

Watchers are the second half of this plan: an optional `watcher:` subspec per resource that emits `notifications/resources/updated` to subscribed clients when the underlying data changes. Two watcher types ship in v1: `polling` (re-invoke the handler on an interval and compare content hashes) and `file` (`fs.watch` on a filesystem path). The low-level subscribe/unsubscribe request handlers — which the SDK's `McpServer` high-level class does not wire — are added via `server.server.setRequestHandler` and back a single-client `Set<uri>` of subscribed URIs.

Plan 6 lands the schema, static-resource registration, resources/list + resources/read, subscribe/unsubscribe tracking, polling + file watchers, and the update-notification emitter. URI templates, blob content, webhook watchers, and `resources/templates/list`-backed completions are out of scope and carried to Plan 7 (prompts + completions) and beyond.

## Context

The jig design target — streamlinear and similar "LLM orchestrates a known surface" servers — needs two things resources solve. First, **read-only context** the agent can pull without invoking a tool: the list of active workflow states, the current team roster, the schema for a given action. Second, **live-updating context** when that data changes mid-session without an agent-initiated refresh: new jobs land in a queue, workflow states shift, a config file gets edited.

Plan 5 gave jig `probes:` — a boot-resolved, read-many surface. That covers slow-changing upstream data (git SHA, AWS identity, Linear teams). Probes don't emit updates and don't surface via an MCP method — they're interpolated into tool descriptions and handler config.

Resources are the request-response counterpart: the client pulls them on demand via `resources/read`, and the server proactively announces changes via `notifications/resources/updated`. The MCP spec treats resources as the "GET" half of the protocol (tools are the "POST"), and several clients (Cline, Continue) surface resources as addressable context in the UI.

The design doc's master section ([`record/designs/2026-04-13-jig-design.md`](2026-04-13-jig-design.md):170-190) specifies the shape; this plan locks in the v1 subset.

## Approach

### Schema additions

A new optional top-level `resources:` block — an array of resource specs:

```yaml
resources:
  - uri: config://jig/server        # required; static URI string
    name: Jig Server Config         # required; human-readable
    description: Current jig config # optional
    mimeType: application/json      # optional
    handler:
      exec: "cat ./state/config.json"
    watcher:
      type: polling                 # polling | file
      interval_ms: 5000             # required for polling
      change_detection: hash        # optional; hash | always; default hash
```

**Validation rules** (`src/runtime/resources.ts`):

- `resources:` is undefined OR an array (rejects mapping, scalar, null).
- Each resource is a mapping with:
  - `uri` — required non-empty string; must parse as a URL (any scheme, including custom schemes like `config://`, `queue://`, `file://`). URIs must be unique across the `resources:` block.
  - `name` — required non-empty string.
  - `description` — optional string.
  - `mimeType` — optional string.
  - `handler` — required; reuses `validateHandler` from `config.ts` (any of inline / exec / dispatch / compute / http / graphql).
  - `watcher` — optional mapping.
- Watcher validation:
  - `type` — required, one of `polling` | `file`. Unknown values rejected.
  - `polling`: `interval_ms` required positive number; `change_detection` optional, one of `hash` | `always`, default `hash`.
  - `file`: `path` required non-empty string (a filesystem path; no glob support in v1).
- Unknown keys at resource-entry level and watcher level are rejected (matches `validateProbes`, `validateConnections`).

**Type definitions** (`src/runtime/config.ts`):

```typescript
export type WatcherSpec =
  | { type: "polling"; interval_ms: number; change_detection?: "hash" | "always" }
  | { type: "file"; path: string };

export interface ResourceSpec {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: Handler;
  watcher?: WatcherSpec;
}

export type ResourcesConfig = ResourceSpec[];
```

### Handler reuse + read translation

Resource `handler:` blocks reuse the exact validator and dispatcher as tool handlers. Plan 6 adds no new handler types. The read callback shape:

```typescript
async (uri: URL, _ctx: ServerContext): Promise<ReadResourceResult> => {
  const raw = await invoke(spec.handler, {}, invokeCtx);
  if (raw.isError) {
    throw new ProtocolError(
      ProtocolErrorCode.InternalError,
      `resource "${uri}" read failed: ${raw.content[0]?.text ?? "<no message>"}`,
    );
  }
  return {
    contents: [{
      uri: uri.toString(),
      ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
      text: raw.content[0]?.text ?? "",
    }],
  };
};
```

**Design decision: `args = {}` for resource invocations.** Resources have no per-call args — the URI is the addressable identity. The handler sees an empty `args` object; probes + connections are still in the `InvokeContext`. This matches the probe resolver's convention from Plan 5.

**Design decision: text-only content.** `ReadResourceResult.contents[]` supports both `{ text }` and `{ blob }`. v1 ships `text` only. A future plan adds a `encoding: text | base64` hint on the handler or a new handler type for binary streams — deferred because the first real users (streamlinear, jig-self-documenting) don't need blobs.

### Boot sequence

`src/runtime/index.ts` gets one new step between "register tools" and "connect transport":

```typescript
// existing: resolveProbes(...) -> probe
// existing: createServer(config, probe)
// existing: for-loop registerTool

// NEW: resource registration
if (config.resources) {
  registerResources(server, config.resources, ctx);
}

// NEW: watcher startup (returns disposers for a future graceful-shutdown plan)
const disposers = startWatchers(config.resources ?? [], server, ctx);

await server.connect(createStdioTransport());
```

`registerResources(server, resources, ctx)` lives in `src/runtime/resources.ts`. It iterates the array, calls `server.registerResource(name, uri, metadata, readCallback)` per entry, and captures the `RegisteredResource` handles (unused in v1; consumed by the future reload plan).

`startWatchers(resources, server, ctx)` lives in the same file. It iterates resources with `watcher:` set and spawns a watcher per entry. Returns an array of `() => void` disposers so a future shutdown path can stop them cleanly; v1 lets the process exit handle cleanup.

### Subscribe/unsubscribe wiring

The high-level `McpServer.registerResource` auto-wires `resources/list`, `resources/templates/list`, and `resources/read` request handlers, and declares `capabilities.resources.listChanged: true`. It does **not** wire `resources/subscribe` or `resources/unsubscribe`.

`src/runtime/server.ts` gains one new method on `JigServerHandle`:

```typescript
trackSubscriptions(): SubscriptionTracker;
```

Called once in `index.ts` after resource registration but before `server.connect`. It:

1. Reaches into `server.server` (the underlying low-level `Server`) and registers handlers for `resources/subscribe` and `resources/unsubscribe`.
2. Declares `capabilities.resources.subscribe: true` via `server.server.registerCapabilities()`.
3. Returns a `SubscriptionTracker` with one method: `isSubscribed(uri: string): boolean`. The tracker owns an internal `Set<string>`.

**Design decision: single-client, in-memory subscription state.** Stdio transport = one client per process. A process-scoped `Set<uri>` captures the full subscription universe. Multi-client (HTTP transport with session IDs) would need a `Map<sessionId, Set<uri>>`; that's Plan 8+ territory.

**Design decision: subscribe/unsubscribe always succeed.** Per spec, a client may subscribe to a URI that isn't currently registered (they'll just never receive updates). Jig accepts any URI string; no existence check at subscribe time. This matches the spec's "graceful no-op" stance and avoids races with hot-reload.

### Watcher implementations

**Polling watcher** (`startPollingWatcher`):

1. Compute an initial hash of the handler's current text content (first invocation at boot).
2. `setInterval(interval_ms)` fires the handler.
3. If `change_detection: hash`, compute `sha256(text)` and compare to the last hash. Only emit if different.
4. If `change_detection: always`, emit on every interval regardless of content.
5. On handler error (`isError: true` or exception), log to stderr and skip the emit. Do not crash the server — a transient upstream failure shouldn't kill a long-running session.
6. Emit via `tracker.isSubscribed(uri) && server.sendResourceUpdated({ uri })`. The gate keeps notification traffic low for un-subscribed URIs.

**File watcher** (`startFileWatcher`):

1. `fs.watch(path, { persistent: false })` — `persistent: false` so the watcher doesn't keep the process alive past a clean shutdown.
2. On any event (`change` | `rename`), emit if subscribed. No hash check — file events are already an upstream-provided change signal.
3. On watcher error (`error` event), log to stderr. Do not crash. A missing file is a legitimate runtime state for a resource that's about to exist.

**Security:** file watcher paths go through the same `isPathAllowed` gate as `exec:` handler paths (ADR-0009). A path outside `server.security.filesystem.allow` fails at boot with a clear error. This is enforced in `validateResources` (or deferred to boot in `startWatchers`; Phase 3 makes the call).

### Capabilities advertised

After Plan 6, the server's initialize response includes:

```json
{
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "listChanged": true, "subscribe": true }
  }
}
```

`listChanged: true` is set by the SDK when `registerResource` runs. `subscribe: true` is set explicitly by `trackSubscriptions()`.

### Out of scope (deferred to later plans)

- **URI templates (`resources/templates/list`)** — the SDK supports them; jig's schema doesn't declare a template shape yet. Deferred to Plan 7 because template variable completion binds to the `completions:` surface, and shipping half of it (templates without completion) produces an awkward intermediate state.
- **Blob content** — `ReadResourceResult.contents[].blob` (base64). Authors with binary resources get deferred until a real user asks; the handler-to-blob translation needs a design decision about where encoding happens.
- **Webhook watcher** — requires jig to listen on an HTTP port. Current transport is stdio-only; adding an inbound HTTP listener sideways to stdio is architecturally heavy for v1.
- **Glob paths for file watcher** — a `path: "./state/*.json"` would need `chokidar` or equivalent. Single-path `fs.watch` only in v1.
- **Per-watcher security allowlist** — file watcher paths go through the same allowlist as exec paths. A future plan may introduce a dedicated `security.resources.allow` surface.
- **Graceful shutdown** — watcher disposers are collected but never invoked in v1. Process exit cleans up `setInterval` / `fs.watch` handles. A SIGTERM-handling plan consumes them.
- **Mid-session resource add/remove** — `sendResourceListChanged` fires automatically on `registerResource`, but jig only calls it once per resource at boot. A future reload plan (same one that handles YAML hot-reload) adds runtime registration.
- **Resource authorization** — the spec allows servers to authorize reads per-URI. v1 trusts the transport (stdio = local user, already trusted). A future auth plan revisits.
- **`completion/complete` for resource URIs** — ties back to URI templates. Plan 7.

## Alternatives considered

### Start/stop watchers on subscribe/unsubscribe

Instead of running watchers unconditionally, gate the watcher lifecycle on subscription state: start the `setInterval` / `fs.watch` only when the first client subscribes; tear down when the last unsubscribes.

**Rejected** because (a) single-client stdio makes the optimization moot — the one client subscribes or it doesn't, watcher cost is the same across the process lifetime; (b) start-on-subscribe adds a race: a client that subscribes, immediately reads, and expects the next read to see fresh data would miss the first poll interval; (c) the state machine grows (per-URI ref count, handle lifecycle, idempotent subscribe). The bookkeeping isn't worth it for v1's single-client target.

Revisit when Plan 8+ adds HTTP transport with session IDs.

### Use `notifications/resources/list_changed` + no subscriptions

The spec permits servers to emit `list_changed` without any subscription — it's a broadcast "you should re-list and re-read." This is the "poor-man's subscribe" route: clients refresh everything when anything changes.

**Rejected** for the noisy-notification case: a resource that polls every 5s would broadcast 720 list-changed events per hour, forcing clients that don't care about that specific URI to re-list. `resources/updated` targets a single URI and carries the subscription contract. `list_changed` is reserved for structural changes (resource added / removed) — Plan 6 fires it once at boot via the SDK auto-wire, and again in a future reload plan.

### Define a new handler type `resource:` instead of reusing tool handlers

A dedicated handler shape could carry resource-specific fields (default mime type inference from content, URI-scoped args).

**Rejected** because all the design target use cases (cat a JSON file, curl a status endpoint, compute a shape from probe data) are already expressible with the existing six handler types. Adding a seventh just to handle "this happens to be a resource" duplicates validation, dispatch, and test surface for no new capability.

### jq for `change_detection` instead of hash

Let authors declare `change_detection: { jq: ".jobs | length" }` — emit only when the extracted projection changes, not the full content.

**Rejected** for v1 — adds a new dependency (or another JSONLogic extraction) and a new expression-engine knob per plan doc. `change_detection: hash` covers 90% of "notify when content changes"; authors with selective notification needs can write a `compute:` handler that itself does the projection.

## Consequences

### Good

- Authors get the second half of the MCP read surface — tools (POST) and resources (GET) are both first-class YAML declarations.
- Watcher infrastructure lands with a clean interface (`startWatchers` returns disposers) that a future graceful-shutdown plan can consume without rework.
- The handler quarantine holds: resources reuse the existing `invoke()` dispatcher; no handler-type sprawl.
- Subscription state is process-scoped and trivial. A future HTTP transport plan can swap the `SubscriptionTracker` for a session-aware one without touching watcher code.
- `capabilities.resources.subscribe: true` lights up every MCP client that currently surfaces the resource panel — Cline, Continue, Zed — so streamlinear-style use cases work on day one.

### Bad

- The SDK's `McpServer` doesn't cover subscribe/unsubscribe. Reaching into `server.server.setRequestHandler` breaks the "SDK quarantine is confined to `server.ts`" invariant only in that one file — the invariant is adjusted to "every direct SDK import lives in `server.ts`", which is already the case. No SDK imports leak out, but `server.ts` now calls into two sibling surfaces (`registerTool`, `trackSubscriptions`) that each reach into `server.server` for different reasons.
- Watchers introduce jig's first long-lived background work. `setInterval` / `fs.watch` handles outlive any single request. A bug that leaks handles doesn't surface in request latency — it surfaces as a process that won't exit cleanly. Test discipline (see Plan 6 Phase 3+) has to cover the lifecycle explicitly.
- Polling watchers re-invoke handlers on a timer. Authors who declare a polling resource against a rate-limited upstream API will hit the rate limit. We document this in the example YAML's comments and in the handoff's Landmines section.
- File watchers use Node's `fs.watch`, which has documented platform inconsistencies (macOS coalesces events, Linux delivers rename+create pairs, Windows has its own semantics). v1 accepts the SDK-of-node's behavior; users on exotic filesystems (network mounts, Docker bind mounts) may see duplicate or missed events. The emit-on-any-event strategy tolerates duplicates fine; missed events are a known gap.

### Neutral

- The `resources:` schema is forward-compatible with URI templates (add a `template: "queue://jobs/{status}"` field alongside `uri:`) and with webhook watchers (add `type: webhook` with `url:` to the watcher union). Plan 7 / Plan 8 extend without breaking.
- `change_detection: hash` stores only the last hash per resource — constant memory regardless of resource content size.
- No new runtime dependencies. `crypto.createHash` (node built-in), `fs.watch` (node built-in), `setInterval` (global).

## Related decisions

- **ADR-0009** (path confinement) — file watcher paths respect the filesystem allowlist.
- **ADR-0010** (network confinement) — polling watchers with http/graphql handlers respect the network allowlist.
- **Plan 5 design doc** — the `invoke(handler, args, ctx)` shape resources reuse was normalized in Plan 5 Phase 3.
- **Plan 4 design doc** — the `CompiledConnection` headers+timeout infrastructure resources reuse indirectly via http/graphql handlers.
