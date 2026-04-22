---
audit: 2026-04-21-Full repo audit — src/runtime, src/cli, examples, and tests
last_updated: 2026-04-21
status:
  fixed: 6
  mitigated: 0
  accepted: 0
  disputed: 0
  deferred: 0
  open: 6
---

# Actions Taken: Full repo audit — src/runtime, src/cli, examples, and tests

Summary of remediation status for the [2026-04-21 Full repo audit — src/runtime, src/cli, examples, and tests audit](README.md).

---

## 2026-04-21 — Remove string-form exec handler entirely

**Disposition:** fixed
**Addresses:** [exec-string-argv-injection](README.md#exec-string-argv-injection)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

Removed the string-form `exec` handler completely. The `ExecHandler` type now
requires `exec: string[]` — no string form, no whitespace splitting, no argument
injection surface. The config validator rejects `exec: "..."` with a clear error
message directing authors to use the array form. Updated all examples, tests,
README documentation, and the `ProbeHandler` type to match.

The string form was introduced in PR #9 and survived PR #72's "fix" because that
PR added the array form alongside the string form rather than replacing it.

---

## 2026-04-21 — Encode interpolated HTTP path segments

**Disposition:** fixed
**Addresses:** [http-path-template-traversal](README.md#http-path-template-traversal)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

Added `renderUriEncoded()` to `src/runtime/util/template.ts` — same as `render()`
but applies `encodeURIComponent()` to each interpolated value while leaving literal
template text unchanged. The HTTP handler now uses this for path rendering, so a
caller-supplied `{{id}}` containing `../` or `?` characters gets encoded into a
single path segment instead of reshaping the URL.

---

## 2026-04-21 — Add Host/Origin validation to HTTP transport

**Disposition:** fixed
**Addresses:** [http-transport-dns-rebinding](README.md#http-transport-dns-rebinding)
**Commit:** pending (staged on fix/audit-security-findings)
**Author:** Clay Loveless + Claude

The HTTP transport now validates the `Host` header against a set of known loopback
addresses (127.0.0.1, localhost, ::1) plus the configured hostname, all with the
bound port. Requests with an unrecognized Host get a 403. Browser requests that
include an `Origin` header are checked against an explicit allowlist
(`allowedOrigins` option); if no allowlist is configured, all Origin-bearing
requests are rejected. Non-browser clients (curl, MCP SDKs) that omit Origin are
unaffected.

---

## 2026-04-21 — Move --version check before subcommand dispatch

**Disposition:** fixed
**Addresses:** [cli-version-flag-never-reaches-version-branch](README.md#cli-version-flag-never-reaches-version-branch)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Moved the `-V`/`--version` check to run before `parseArgs` and the no-command
bail-out in `src/cli/index.ts`. `jig --version` now prints the version instead
of showing the usage banner.

---

## 2026-04-21 — Enable --no-watch negation in dev command

**Disposition:** fixed
**Addresses:** [dev-no-watch-flag-is-not-supported](README.md#dev-no-watch-flag-is-not-supported)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Added `negatable: true` to the `watch` option in `src/cli/dev.ts`. Node's
`parseArgs` strict mode now accepts `--no-watch` and sets `values.watch` to
`false`, matching the documented behavior in the help text.

---

## 2026-04-21 — Wire --port into build output via embeddedPort

**Disposition:** fixed
**Addresses:** [build-port-flag-is-ignored](README.md#build-port-flag-is-ignored)
**Commit:** pending (staged on fix/audit-cli-contract)
**Author:** Clay Loveless + Claude

Added `embeddedPort` to `src/runtime/embedded-config.ts` alongside `embeddedYaml`.
The build command now validates the `--port` value and emits it into the esbuild
plugin's generated module. The runtime reads `embeddedPort` as a fallback when no
`--port` CLI arg is present, so a built artifact with `--port 8080` serves HTTP
by default while still allowing runtime override via `--port`.
