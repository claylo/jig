---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0005: Discover sibling YAML relative to server.mjs, not the working directory

## Context and Problem Statement

A jig-produced `server.mjs` needs to find optional sibling YAML files (baseline overrides, extension config) at runtime. MCP clients launch servers as subprocesses, and the question is: relative to what does "sibling" mean — the current working directory the client chose, or the directory the `.mjs` file itself lives in?

The standard CLI convention (bito, git, most config-aware tools) walks up from the current working directory until it finds a config file. That convention assumes the user chose the working directory on purpose. MCP clients break that assumption: Claude Desktop on macOS launches servers with the app bundle as the working directory, not a project folder. The user never chose that path. Worse, GUI MCP clients inherit only the system PATH, not the shell PATH — so `nvm`-managed Node installations frequently fail to launch at all, and when they do, `process.cwd()` points somewhere the author never anticipated.

How should `server.mjs` discover sibling YAML so the "drop the file and go" install pattern actually works?

## Decision Drivers

- Zero-ceremony install: author publishes a stable URL, user runs `curl -O`, drops the file in any directory, pastes a 4-line block into `.mcp.json`
- GUI MCP clients on macOS choose the working directory; the user doesn't
- `.mcp.json` entries should name `server.mjs` by path without also hardcoding an absolute `--config` path — every absolute path is future maintenance
- The mental model we want authors to teach end users: "server.mjs and its YAML live together"

## Considered Options

- **Resolve sibling YAML from `dirname(fileURLToPath(import.meta.url))`** — the directory the `.mjs` lives in, regardless of the working directory
- **Walk up from `process.cwd()`** — bito's pattern; the familiar CLI convention
- **XDG config directory (`~/.config/jig/`)** — the global-config convention
- **Require `--config PATH` on the command line, always** — explicit absolute paths in every `.mcp.json` entry
- **Environment variable (`JIG_CONFIG`)** as the primary discovery path

## Decision Outcome

Chosen option: **"Resolve sibling YAML from `dirname(fileURLToPath(import.meta.url))`,"** because the server binary is the only path we can rely on at runtime. The working directory is the client's choice, not the user's. Resolving relative to the binary's own location means the install instruction is literally "drop `server.mjs` and its YAML files in the same directory, done" — no absolute paths in `.mcp.json`, no PATH inheritance games, no CWD surprises.

`--config PATH` and `JIG_CONFIG` remain supported as explicit overrides for edge cases (CI, testing, shared-config deployments). They are not the default discovery path.

### Consequences

- Good, because the install story collapses to "curl the `.mjs`, drop YAML next to it, paste 4 lines into `.mcp.json`" — no absolute paths anywhere
- Good, because PATH and CWD failures in GUI MCP clients (Claude Desktop + nvm is the canonical case) stop mattering for config discovery
- Good, because the mental model matches the filesystem: `server.mjs` and its YAML are siblings and behave like siblings
- Good, because authors can ship a baseline `server.mjs` with embedded YAML and let end users drop a sibling `overrides.yaml` next to it without editing any command line
- Bad, because users coming from bito, git, or other upward-walk tools will ask "why doesn't jig just find my config?" — we have to teach the new model
- Bad, because a single `server.mjs` can't pick up different configs based on where the user runs it from; per-project customization means a copy of the `.mjs` per project (which is the whole "drop it in a directory" pattern, so this is the design, not a bug)
- Bad, because `--config` and `JIG_CONFIG` exist as overrides and create a small "three ways to configure" surface that documentation has to explain

### Confirmation

- `server.mjs` integration test: launch from a working directory that contains no YAML, sibling YAML lives next to the `.mjs`, server loads the sibling config
- `server.mjs` integration test: launch from a directory that contains `jig.yaml` but the `.mjs` lives elsewhere — confirm the CWD `jig.yaml` is ignored
- Manual test: install a jig-built `.mcpb` in Claude Desktop with `nvm`-managed Node, confirm the server starts and loads sibling YAML

## Pros and Cons of the Options

### Resolve from `dirname(fileURLToPath(import.meta.url))`

`server.mjs` computes its own directory at runtime using Node's standard ESM idiom: `const here = dirname(fileURLToPath(import.meta.url))`. Sibling YAML is looked up at `here/<name>.yaml`.

- Good, because the path is deterministic and doesn't depend on how the client launches the server
- Good, because it matches the "drop both files in a directory" mental model we push in install docs
- Good, because it eliminates the entire class of CWD and PATH failures that plague GUI MCP clients on macOS with nvm
- Neutral, because the idiom is one-liner boilerplate in ESM — not free, but not expensive
- Bad, because the convention differs from bito, git, and most CLI tools — we have to teach it

### Walk up from `process.cwd()` (bito's pattern)

Search upward from the working directory for a `jig.yaml` or similar, stopping at the user's home directory.

- Good, because it's the familiar CLI convention; users coming from other tools don't need to learn a new rule
- Good, because it supports per-project config without copying the binary
- Bad, because MCP clients choose the working directory, not the user — on macOS, Claude Desktop launches with the app bundle as CWD, which has no relation to any project
- Bad, because it turns every `.mcp.json` entry into a landmine: the server's behavior depends on a path the user never sees
- Bad, because debugging config discovery becomes "what was my CWD when the client launched me," which is an opaque question in GUI clients

### XDG config directory (`~/.config/jig/`)

Look for configuration in a well-known per-user directory.

- Good, because it's a tested convention on Linux and increasingly on macOS
- Good, because users with multiple jig servers can share connection credentials in one place
- Bad, because it forces a global-config mental model when jig's target use case is per-server, per-directory customization
- Bad, because it makes "drop the file and go" impossible — every install needs a second step to create or edit files under `~/.config`
- Bad, because server-specific config in a shared directory invites collision: two jig servers both named `linear` stomp on each other

### Require `--config PATH` on the command line, always

The `.mcp.json` entry includes `--config /absolute/path/to/jig.yaml`. No discovery happens at runtime.

- Good, because it's explicit; no magic, no surprises
- Good, because it works identically across every client
- Bad, because every `.mcp.json` entry must hardcode an absolute path — which is precisely the friction the "curl and drop" pattern exists to eliminate
- Bad, because moving the `server.mjs` to a new directory breaks every config that pointed at the old path
- Bad, because authors writing install instructions have to explain "replace `/path/to/` with your actual path" — the worst kind of getting-started friction

### Environment variable (`JIG_CONFIG`) as primary discovery

The `.mcp.json` entry sets `JIG_CONFIG=/absolute/path/to/jig.yaml`. No discovery happens at runtime.

- Good, because it keeps the command line clean
- Bad, because it has the same absolute-path problem as `--config`, just relocated to a different field in `.mcp.json`
- Bad, because env vars in `.mcp.json` are harder to read than positional config, especially when clients render the config in a UI

## More Information

- Design doc: [`/record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md) — see the "Distribution model" section for the curl-and-drop install pattern and the "Alternatives considered" entry on CWD walking
- Implementation lives in the runtime's `config.ts` module (`src/runtime/config.ts` in the build pipeline)
- The Node.js idiom in full:
  ```javascript
  import { dirname } from "node:path";
  import { fileURLToPath } from "node:url";
  const here = dirname(fileURLToPath(import.meta.url));
  ```
- Revisit if MCP clients converge on a standard CWD convention (e.g., "always launch servers in the user's project directory"). As of early 2026, no such convention exists.
