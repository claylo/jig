# Handoff: jig runtime — Plan 4 complete

**Date:** 2026-04-14
**Branch:** feat/plan4-complete (pending merge)
**State:** Green

> Green = Phases 1–6 are merged on main; Phase 7 lands on main in the same commit as this handoff. All six gates pass: `npm run check`, `npm test` (152/152), `just smoke`, `just smoke-dispatch`, `just smoke-compute`, `just smoke-http`. Plan 4 is complete with this commit.

## Where things stand

Plan 4 is done. Authors can declare `connections:`, interpolate secrets with `${VAR}`, and call REST and GraphQL upstreams through `http:` and `graphql:` handlers — all deny-by-default at the network layer. The Plan 4 example at `examples/http-and-graphql.yaml` exercises every new surface in one file; a fixture-driven integration test round-trips both handler types over stdio.

## What changed

Seven implementation phases (Phase 0 landed the plan doc itself):

- **Phase 1** — `${VAR}` shim for connection-string interpolation (ADR-0011) — `4e9f9ca` / claylo/jig#26
- **Phase 2** — `connections:` block schema + header compilation — `3ec41e7` / claylo/jig#28
- **Phase 3** — network host confinement (ADR-0010) — `567b252` / claylo/jig#29
- **Phase 4** — fetch wrapper (host check, timeout, envelope modes) — `27adfe5` / claylo/jig#30
- **Phase 5** — http handler (method/path/query/body/headers/response) — `5804f41` / claylo/jig#31
- **Phase 6** — graphql handler with error auto-detect — `4023d4a` / claylo/jig#32
- **Phase 7** — example, `smoke-http`, integration test, this handoff — pending commit on `feat/plan4-complete`

## Decisions made

- **Network deny-by-default, inferred from `connections:`** — per ADR-0010. An explicit `server.security.network.allow` wins; otherwise hosts are inferred from connection URLs. The example leaves `network.allow` unset and depends on inference for `api.example.invalid`.
- **`${VAR}` compiles to JSONLogic** — per ADR-0011. The shim expands at parse time into `env.get` (or `cat` for mixed literals), evaluated per-request against an empty context. Env allowlist (ADR-0009) gates which vars resolve.
- **`invoke(handler, args, ctx)` threads compiled connections** — ctx is `{ connections: Record<string, CompiledConnection> }`. `dispatch.ts` keeps its `InvokeFn` shape via a closure in `src/runtime/handlers/index.ts:26`. Do not import the context type into dispatch — it would re-create the cycle.
- **GraphQL fetches in envelope mode internally, projects to `data` or `envelope` at the end** — so error-shape parsing has access to status and headers on 4xx/5xx. `src/runtime/handlers/graphql.ts:44-54`.
- **Specific-path `git add` over `git add -A`** — plugin hooks drop files mid-session (`.config/bito.yaml`, `.bito.yaml`). Staging by path keeps scope clean. Continued from the Phase 5 handoff convention.

## What's next

1. **Merge Phase 7 / close Plan 4** — `gtxt && git pm` on `feat/plan4-complete` after Clay reviews the staged set.
2. **Open a fresh session for Plan 5 (probes).** Early design call — where do probes sit in the lifecycle? Three shapes to weigh:
   - Boot-time helper invocations that return cached values (simple, synchronous at ready).
   - Async-refresh track (probe TTL + background refresh).
   - `{{probe.NAME}}` as a Mustache extension (author-facing surface).
   Probes are consumers of the Plan 4 handlers at startup; the consumer shape is stable now. The design question is the lifecycle and the author surface, not the handler plumbing.
3. **Scan the Plan 5 doc's code blocks before dispatching phases.** Plan 4 caught five plan-originated defects across six phases (self-identical ternary, non-existent JSDoc helper, dead const + case-sensitivity oversight, missing unknown-key rejection, and in Phase 7 a type-only `AddressInfo` imported as a value). Pre-flight scans pay for themselves.

## Landmines

- **Fetch abort signal.** `performFetch` treats timeouts as generic errors unless `signal.aborted` is checked. A refactor that consults the signal state after the catch loses scope regresses the distinct timeout message.
- **Handler `url:` without `connection:` carries no headers.** The author must also declare the host explicitly in `server.security.network.allow` — inference only fires for hosts named in `connections:`.
- **GraphQL internal fetch mode is load-bearing.** It always fetches in `envelope` mode internally and projects to `data` or `envelope` at the end. A refactor that flips the internal mode to `body` loses status and headers on error paths.
- **GraphQL assumes the response body is JSON.** Non-JSON errors (upstream 502 HTML pages) surface as `graphql: response body is not JSON`. Clear message — but any refactor that short-circuits the parse must preserve the message.
- **Connection headers evaluate against an empty context.** `{"var":"args.token"}` in a header gets `null`. Handler fields are the place for args; connection fields are for env + statics only.
- **`compileConnections({})` returns `{}`.** Every handler that names a connection not in the map returns `isError` with a clear "unknown connection" message. A future refactor that moves compilation behind a lazy path could turn this into "undefined is not a function" — keep compilation eager.
- **Plan 7's integration-test snippet imports `AddressInfo` as a value.** Node's ESM flags it — it is a type-only export. The code in `tests/integration.test.ts` uses `import type` to compile under `--experimental-transform-types`. A future edit that drops `type` will break the test at load time, not at run time.
- **`commit.txt` is globally gitignored** — it is consumed by `gtxt`, which removes it. Do not look for it in `git status`.
- **`.config/bito.yaml` regenerates between sessions** from the building-in-the-open session-start hook. It is untracked by design; leave it out of staging.
