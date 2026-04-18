# Handoff: Full Repo Audit Remediation

**Date:** 2026-04-18
**Branch:** `main` (all work merged via 6 PRs: #72-#77; one pending commit on `test/audit-server-adapter-tests`)
**State:** Green

> Green = tests pass, safe to continue. Yellow = tests pass but known issues exist. Red = broken state, read Landmines first.

## Where things stand

The `cased` audit at `record/audits/2026-04-18-full-repo/` found 29 findings across 7 surfaces. All 29 are now dispositioned: 24 fixed, 1 accepted, 4 deferred. Tests: 329 pass (up from 308). The remediation ledger at `record/audits/2026-04-18-full-repo/actions-taken.md` tracks every finding with commit SHAs.

## Decisions made

- **Exec handler supports both `string` and `string[]` forms.** String form preserved for backward compatibility; array form eliminates the argument injection class entirely. Each array element is one argv entry regardless of content.
- **`version: "1"` required in all YAML configs.** Zero users exist, so no migration cost. All 10 examples and 168 test YAML blocks updated. Future versions branch on this field.
- **Helpers merged into `jsonlogic.ts`.** The engine singleton never leaves the module. If user-defined JSONLogic helpers become necessary, export a narrow `addMethod(name, fn)` wrapper — not the engine. Comment at `src/runtime/util/jsonlogic.ts:14-16` documents this.
- **GraphQL response mode unified to `"body" | "envelope"`.** `"data"` accepted as deprecated alias in the config parser, normalized to `"body"` internally.
- **`PATH` removed from default env allowlist.** Authors who need it can opt in via `security.env.allow`.
- **`tools.listChanged: true` kept.** Hot-reload is planned; the capability is pre-declared intentionally.

## What's next

1. **Commit the pending branch** — `test/audit-server-adapter-tests` has `tests/server.test.ts` (14 tests) and the final ledger update. Run `gtxt`.
2. **Documentation session** — deferred finding `no-user-facing-documentation`. Assemble README from design docs, example comments, and the YAML schema reference. Content exists; needs assembly.
3. **Streamable HTTP transport** — deferred finding `stdio-only-transport`. `server.ts` already accepts a `Transport` interface, so implementation is additive. See `src/runtime/transports/stdio.ts` for the pattern.
4. **Plan 10: CLI** — deferred finding `cli-surface-not-implemented`. Six commands: `jig new/dev/validate/build/serve/inspect`. Design at `record/designs/2026-04-13-jig-design.md:49-56`. Handoff at `.handoffs/2026-04-16-1123-jig-cli-plan10-ready.md`.
5. **SDK pin** — deferred finding `mcp-server-pinned-alpha`. Switch `@modelcontextprotocol/server` from exact `2.0.0-alpha.2` to `^2.0.0` when stable ships.

## Landmines

- **Exec string form is still accepted.** The array form eliminates argument injection, but the string form (whitespace-split) is preserved for backward compatibility. Existing YAML configs using `exec: "command {{arg}}"` still work but are vulnerable. Consider deprecation warnings in a future release.
- **`"data"` alias in graphql response mode is undocumented.** The parser silently normalizes `"data"` to `"body"`. If docs describe the old `"data"` value, readers will find it works but it won't appear in type definitions or schema references.
- **`max_output_bytes` on exec handler is new and untested in integration.** Unit tests cover the field, but no integration test exercises a command that exceeds the limit. The default 1 MB matches Node.js behavior, so existing tests pass unchanged.
- **Response body size limit (10 MB) uses streaming reader.** `performFetch` no longer calls `response.text()` directly — it reads chunks via `response.body.getReader()`. If a future change needs to support responses without a body stream (e.g., mocked responses in tests), `readBodyWithLimit` handles `!response.body` by returning `""`.
