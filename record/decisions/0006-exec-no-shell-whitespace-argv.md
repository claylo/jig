---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0006: `exec:` handler runs via `execFile` without a shell

## Context and Problem Statement

The `exec:` handler takes a string like `./handlers/get {{id}}` and runs it. Does "run it" mean `sh -c` (shell invocation, metacharacters honored) or `execFile` (program + argv, no shell)?

## Decision Drivers

- Shell interpretation exposes command injection if any templated value is untrusted.
- Pipes, redirects, and `$VAR` expansion are useful but routinely surprise authors used to shell vs. POSIX exec distinctions.
- Jig's target surface is "author ships a handler script; MCP server routes to it." Authors who need pipes already own the handler script.
- Plan 3's JSONLogic and Plan 4's `connections:` remove most of the real pressure to put logic inside exec strings.

## Considered Options

- **`execFile` with whitespace-split argv** (chosen).
- **`spawn` with `shell: true`.**
- **`exec:` accepts `{ command: string, args: string[] }` instead of a single string.**

## Decision Outcome

Chosen: **`execFile` + whitespace split**.

- The rendered command string is split on whitespace into argv.
- `argv[0]` is the program; the rest are arguments.
- `child_process.execFile(argv[0], argv.slice(1))` runs it with no shell.
- Quoting, pipes, redirects, and environment expansion in the command string are literal. Authors who need them write a wrapper script and exec that script.

### Consequences

- Good, because command injection via Mustache-substituted args is limited to the argv slot they land in — a malicious `{{id}}` becomes `argv[N]`, not a shell command.
- Good, because PATH-vs-absolute-path behavior matches `execFile`'s documented semantics; no shell surprises.
- Good, because the argv split is auditable in one file.
- Bad, because filenames containing spaces break the split. Authors who need spaces ship a wrapper script or use a structured command form in a later plan.
- Bad, because `$VAR` in the command string doesn't expand. Authors who need env vars reference them explicitly in the wrapper script.

### Confirmation

`tests/handlers.test.ts` covers: happy-path stdout capture, Mustache-rendered argv, non-zero exit via a fixture script, missing-executable ENOENT, empty-after-render guard. Any future support for `{ command, args }` form or shell mode requires its own ADR.
