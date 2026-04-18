# Agent Briefing — Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples

You are in a `cased` audit output directory. This file exists to help you pick
up remediation work without thrashing. Read it once, then act.

**Audit:** `2026-04-18-Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples`
**Date:** 2026-04-18
**Findings:** 29 total

## Files in this directory

- `README.md`        — authored narrative report (markdown, GitHub-rendered companion to report.html). Read-only for remediation work.
- `report.html`      — interactive rendered report (primary deliverable). Read-only.
- `findings.yaml`    — structured findings (source for the build). Read-only.
- `recon.yaml`       — structural model. Read-only.
- `assets/`          — generated sparkline SVGs. Don't edit.
- `actions-taken.md` — append-only remediation ledger. May not exist yet;
  create it the first time you log an action.
- `AGENTS.md`        — this file.

## The loop

For each finding you address:

1. Find it in `README.md` or `report.html` by its slug. Anchors match the slug
   exactly; every finding is pre-listed in the index below so you don't need
   to grep.
2. Read the concern, location, and remediation text.
3. Make the code change in the target repository.
4. Append one entry to `actions-taken.md`. **One entry per action**, even
   when a single action resolves multiple findings — put every slug it
   addresses in the `Addresses` field.

## `actions-taken.md` format

YAML front matter plus chronological markdown entries. Front matter is
mandatory; update `last_updated` and the `status` counts every time you
add an entry. The `open` count is `29 - (fixed + mitigated +
accepted + disputed + deferred)`.

```markdown
---
audit: 2026-04-18-Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples
last_updated: YYYY-MM-DD
status:
  fixed: 0
  mitigated: 0
  accepted: 0
  disputed: 0
  deferred: 0
  open: 29
---

# Actions Taken: Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples

Summary of remediation status for the [2026-04-18 Full repo audit — src/runtime (TypeScript MCP server runtime), tests, examples audit](README.md).

---

## YYYY-MM-DD — brief description of the action

**Disposition:** fixed
**Addresses:** [finding-slug](README.md#finding-slug)
**Commit:** {SHA or PR link}
**Author:** {who did the work}

One to three paragraphs describing what changed, in which files, and why
this approach. If the disposition is `accepted` or `disputed`, the rationale
must be here. If `deferred`, include the target date or milestone.
```

## Dispositions

- `fixed` — code change deployed; commit SHA or PR link required
- `mitigated` — compensating control in place; root cause remains; explain
  the residual risk
- `accepted` — risk acknowledged; rationale mandatory (who decided, why).
  This is not a euphemism for "ignored"
- `disputed` — finding contested with evidence; not a dismissal. The
  original finding stays in `README.md`; this entry records the counterargument
- `deferred` — scheduled for later; target date or milestone reference
  required. A deferred finding without a target is an accepted finding in
  disguise

## What you must not do

- Do not edit `README.md`, `report.html`, `findings.yaml`, `recon.yaml`, or
  anything in `assets/`. They are the audit artifact and must stay immutable.
- Do not edit past `actions-taken.md` entries. The file is append-only. If
  a previous action is superseded, add a new entry referencing the old one.
- Do not invent finding slugs. Use the ones in the index below, verbatim.
- Do not create an empty `actions-taken.md` until you have at least one
  action to log.

## Finding index

Every finding in this audit. Use these exact slugs in the `Addresses` field
of your `actions-taken.md` entries.

### The Tool Dispatch Boundary

- `exec-arg-injection-via-whitespace-split` (significant) — `src/runtime/handlers/exec.ts:27-28`
- `when-guards-skipped-in-task-dispatch-fusion` (moderate) — `src/runtime/handlers/dispatch.ts:22-25`
- `tool-unknown-keys-not-rejected` (moderate) — `src/runtime/config.ts:547-579`
- `input-type-not-validated` (moderate) — `src/runtime/config.ts:621-626`
- `tool-name-uniqueness-not-enforced` (moderate) — `src/runtime/config.ts:539-545`

### The Error Propagation Surface

- `workflow-fire-and-forget-unhandled-rejection` (significant) — `src/runtime/index.ts:197-211`
- `fetch-response-body-read-uncaught` (moderate) — `src/runtime/util/fetch.ts:57-73`
- `workflow-transition-silent-catch` (moderate) — `src/runtime/tasks.ts:669-684`
- `get-task-result-null-cast` (advisory) — `src/runtime/index.ts:175-177`
- `status-update-fire-and-forget` (advisory) — `src/runtime/tasks.ts:566-570`

### The Config Schema Surface

- `no-schema-evolution-strategy` (significant) — `src/runtime/config.ts:318-332`
- `response-mode-synonym` (moderate) — `src/runtime/config.ts:81`
- `probe-handler-not-deep-validated` (advisory) — `src/runtime/probes.ts:76-88`
- `security-validation-copy-paste` (advisory) — `src/runtime/config.ts:476-534`

### The Network Boundary Surface

- `unbounded-http-response-body` (moderate) — `src/runtime/util/fetch.ts:73`
- `default-env-allowlist-exposes-path` (advisory) — `src/runtime/util/access.ts:27-35`
- `connection-headers-re-evaluated-per-request` (advisory) — `src/runtime/connections.ts:59-72`
- `exec-stdout-default-maxbuffer` (note) — `src/runtime/handlers/exec.ts:37`

### The Code Maintenance Surface

- `triplicate-stringify` (moderate) — `src/runtime/handlers/compute.ts:41-46`
- `duplicate-render-json-leaves` (moderate) — `src/runtime/handlers/http.ts:107-118`
- `no-unit-tests-server-adapter` (moderate) — `src/runtime/server.ts:319-589`
- `duplicate-error-result` (advisory) — `src/runtime/handlers/exec.ts:44-49`
- `getengine-exported-from-util` (advisory) — `src/runtime/util/jsonlogic.ts:51-53`
- `dead-re-export-inline` (note) — `src/runtime/handlers/inline.ts:4`

### The Completeness Surface

- `no-user-facing-documentation` (significant) — `package.json:1-5`
- `cli-surface-not-implemented` (advisory) — `record/designs/2026-04-13-jig-design.md:49-56`
- `stdio-only-transport` (note) — `src/runtime/transports/stdio.ts:1-17`
- `tools-list-changed-advertised-never-fired` (note) — `src/runtime/server.ts:333-337`

### The Supply Chain Surface

- `mcp-server-pinned-alpha` (advisory) — `package.json:16`

## If you have the `cased` skill loaded

Invoke it. The skill's Phase 5 covers remediation tracking with the full
schema reference and worked examples. This briefing exists for the case
where you land in the directory without the skill available.
