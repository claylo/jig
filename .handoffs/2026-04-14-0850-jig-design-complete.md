# Handoff: jig design complete, ready for writing-plans

**Date:** 2026-04-14
**Branch:** main (no commits yet; `git init` ran 2026-04-14)
**State:** Green

> Green = design is approved and documented, safe to start the implementation-planning phase. Nothing is broken because nothing has been built.

## Where things stand

The design phase for `jig` is complete. `jig` is a YAML-driven single-file Node.js MCP server packaging tool. It ships an executable `.mjs` (and optionally a Claude Desktop `.mcpb` bundle) with no runtime dependencies. The design doc, all rejected alternatives, and five architectural decision records are on disk. Implementation has not started.

Design doc: [`record/designs/2026-04-13-jig-design.md`](../record/designs/2026-04-13-jig-design.md). Status: `Draft` — move to `Accepted` once implementation begins.

## Decisions made

- **ADR-0001** — [Typed flat-field dispatcher pattern](../record/decisions/0001-typed-flat-field-dispatcher.md). Dispatcher tools use typed flat fields, not an untyped `payload` catch-all. Follows streamlinear's production code, not the fsck.com post's advocated pattern.
- **ADR-0002** — [JSONLogic via `json-logic-engine`](../record/decisions/0002-jsonlogic-via-json-logic-engine.md). Two templating layers: Mustache for strings, JSONLogic for guards and transforms. Custom operator registry exposes runtime functions to YAML.
- **ADR-0003** — [`extension_points:` per-section policy from day one](../record/decisions/0003-extension-points-per-section-policy.md). Explicit per-section composition rules in the YAML schema from v1. Migrating later would break every existing `jig.yaml`.
- **ADR-0004** — [No plugin system in v1; `exec:` is the escape hatch](../record/decisions/0004-no-plugin-system-in-v1.md). Authors needing custom code ship a companion binary and call it via `exec:` (streamlinear pattern).
- **ADR-0005** — [Sibling YAML from `import.meta.url`, not CWD](../record/decisions/0005-sibling-yaml-from-import-meta-url.md). `server.mjs` resolves YAML relative to itself. Sidesteps GUI-client PATH issues on macOS with nvm.

## What's next

1. Invoke the `superpowers:writing-plans` skill to turn the design doc into a phased implementation plan. Expected phases: project scaffolding → runtime (config loader, MCP wiring, handlers, tasks engine) → CLI (`new`, `dev`, `validate`, `build`) → build pipeline (esbuild + `.mcpb` wrapping) → tests. Budget each phase, ship phase-by-phase.
2. First smoke-test target: `jig dev examples/minimal.yaml` exposes a stdio MCP server that Claude Code can `initialize` and call one tool on. Fastest path to end-to-end.
3. Validate the task/state-machine schema against Clay's first real jig user (a plugin he's about to build with strict task state machine needs). That section of the design is the least exercised; refine against the real workflow early, not late.
4. Create `record/decisions/README.md` as a simple ADR index (the `capturing-decisions` skill maintains this; it was skipped during the parallel-agent dispatch).
5. Make the first commit. `git init` ran; nothing is tracked yet.

## Landmines

- **Stale scaffolding in the repo root.** `package.json`, `tsconfig.json`, `justfile`, `scripts/build.mjs`, `.gitignore` are from a first pass that predates the design. They assume SDK 1.x and a runtime-mode-server (not packaging-tool) architecture. Treat them as stale; rewrite from scratch when implementation starts, don't try to salvage.
- **fsck.com post contradicts streamlinear production code.** The blog post at `blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis.md` advocates an untyped `payload` dispatcher field. The same author's production `streamlinear` MCP uses 13 typed flat fields with per-action `requires:` validation. Reading only the blog post will produce a wrong jig design. [ADR-0001](../record/decisions/0001-typed-flat-field-dispatcher.md) is the canonical answer.
- **MCP SDK 2.x is fresh alpha.** `@modelcontextprotocol/server@2.0.0-alpha.2` was published ~2026-04-06. The `/server`, `/client`, and `/node` (Hono-backed) split is the target architecture, but the API may shift before 2.0 stable. Track it through implementation and be ready to adapt.
- **`ref/` directory contains the source research** (three research reports plus a clarification doc). ADRs cite it by relative path. Do not delete, move, or rename.
- **`.handoffs/` and `record/` are both new this session.** `git init` ran, no commit yet. Clay owns the commit workflow — write `commit.txt`, let him run `gtxt`. See user's global rules; never commit for him.
- **Hot-reload is NOT dev-only.** Server.mjs watches sibling YAML at runtime, per the "drop server.mjs + YAML files in a directory" install model. An early assumption that hot-reload was an author-dev-loop feature is captured in this design as rejected — but a fresh reader might re-infer it if they skim only the build-pipeline section.
- **No plugin system by design.** Future contributors will want to add one. The explicit revisit criteria are in [ADR-0004](../record/decisions/0004-no-plugin-system-in-v1.md). Don't relitigate without evidence that `exec:` is insufficient for a real class of authors.
