# Handoff: HTTP Transport, CLI, and Documentation

**Date:** 2026-04-21
**Branch:** `main` (4 PRs merged: #79-#82)
**State:** Yellow

> Green = tests pass, safe to continue. Yellow = tests pass but known issues exist. Red = broken state, read Landmines first.

## Where things stand

Three of four deferred audit findings are resolved. The runtime now serves MCP over both stdio and Streamable HTTP (`--port`). The CLI (`jig validate/dev/build/new`) is built to `bin/jig` via esbuild and distributed via `npm link`. README covers install, CLI usage, YAML reference, and all 11 examples. Tests: 348 pass (up from 329). One deferred finding remains: SDK pin.

### Audit scorecard (from `.handoffs/2026-04-18-1905-full-repo-audit-remediation.md`)

| # | Finding | Status | PR |
|---|---------|--------|----|
| 1 | Commit pending branch | Done before this session | — |
| 2 | `no-user-facing-documentation` | **Done** | #81, #82 |
| 3 | `stdio-only-transport` | **Done** | #79 |
| 4 | `cli-surface-not-implemented` | **Done** | #80, #81 |
| 5 | `mcp-server-pinned-alpha` | Open — wait for SDK stable | — |

## Decisions made

- **Four CLI commands, not six.** Design doc specifies `new/dev/validate/build`. The prior handoff mentioned `serve` and `inspect` but neither was designed. `dev --port` covers HTTP serving; inspect-like output can live in `validate --verbose` later.
- **`WebStandardStreamableHTTPServerTransport` with `node:http` bridge.** The SDK's HTTP transport uses Web Standard `Request`/`Response`. Node 24's `node:http` still gives `IncomingMessage`/`ServerResponse`, so `src/runtime/transports/http.ts` bridges between them (~40 lines). No new dependencies.
- **CLI built with esbuild, output at `bin/jig` and `bin/jig.mjs`.** Both files are identical (not symlinks), both committed. `package.json` `bin` points at `bin/jig`. `npm link` gives a real `jig` command with no `--experimental-transform-types` flag.
- **Embedded YAML is opt-in, not the default.** `jig build jig.yaml -o out.mjs` embeds; `jig build --bare -o out.mjs` produces a generic server that reads sibling YAML. The sibling-YAML model is the primary distribution path per the design doc.
- **`createRequire` banner in esbuild output.** The `yaml` npm package uses CJS `require('process')` internally. ESM bundles need a real `require` — solved via `import { createRequire } from 'node:module'` in the esbuild banner. Same pattern used for both CLI and runtime builds.
- **CLI modules resolve paths by walking up to repo root.** `new.ts`, `build.ts`, and `dev.ts` find `examples/` and `src/runtime/index.ts` by walking up from `import.meta.url` looking for the directory. Works both from source and from the esbuild bundle in `bin/`.

## What's next

1. **SDK pin** — Switch `@modelcontextprotocol/server` from exact `2.0.0-alpha.2` to `^2.0.0` when the SDK ships a stable release. No action until then.
3. **`.mcpb` build target** — Design doc describes `jig build --target mcpb` for Claude Desktop bundles. Not implemented. Additive — the esbuild pipeline in `src/cli/build.ts` is the foundation.
4. **Hot-reload in `jig dev`** — `dev.ts` watches for YAML changes and restarts the child process. A future version could use the SDK's `sendToolListChanged()` for in-process reload without restart, which is why `tools.listChanged: true` is pre-declared in `server.ts`.
5. **End-to-end test for `jig dev`** — The `dev` command spawns a child process with file watching. No automated test covers this path; the other three commands have tests in `tests/cli.test.ts`.

## Landmines

- **`bin/jig` must be rebuilt after changing CLI source.** The committed `bin/jig` is a build artifact. If you edit anything in `src/cli/`, run `npm run build` and commit the updated `bin/jig` and `bin/jig.mjs`. Forgetting this means the installed CLI is stale.
- **`jig new` depends on `examples/` being findable from `bin/`.** The path-walking logic in `new.ts` walks up to 5 parent directories looking for `examples/`. This works in the repo but will break if the built CLI is copied somewhere outside the repo tree. A future npm-published version needs the examples embedded or resolved differently.
- **`jig build` depends on `src/runtime/index.ts` as the esbuild entry.** Same path-walking issue as `jig new`. The build command finds the runtime source by walking up from its own location. Works in-repo, breaks if isolated.
- **Session friction log.** This session surfaced a recurring pattern: implementations that work but skip delivery requirements specified in the design doc (HTTP transport was deferred across Plans 1-9; CLI was built but not bundled; README showed raw TypeScript invocation instead of the built artifact; output went to `dist/` instead of the project's `build/` convention). The design doc at `record/designs/2026-04-13-jig-design.md` is the source of truth — future sessions should cross-check deliverables against it before claiming work is complete.
