# jig Runtime — Plan 1 (Smoke-Test Path)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a runnable stdio MCP server, invoked directly as `node --experimental-transform-types src/runtime/index.ts --config examples/minimal.yaml`, that responds to `initialize`, `tools/list`, and one `tools/call` against an inline handler defined in YAML.

**Architecture:** TypeScript runtime that loads a YAML config (either via `--config PATH` or sibling to `server.mjs`), spins up an MCP server using the `@modelcontextprotocol/server` 2.x alpha SDK, and serves a minimal tool schema where only the `inline` handler type is implemented. Dispatcher pattern, exec/compute/http/graphql handlers, JSONLogic, Mustache, connections, probes, resources, prompts, tasks, and the CLI are explicitly out of scope for Plan 1 and will be layered on in subsequent plans.

**Tech Stack:** Node 24+, TypeScript 5.7+, `@modelcontextprotocol/server@2.0.0-alpha.x`, `yaml` (v2), Node's built-in `node:test` runner.

---

## Scope Note

This is **plan 1 of ~7** covering the jig design ([`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md)). The design spans runtime + CLI + build pipeline; one monolithic plan would be unwieldy. Each plan produces working, testable software; subsequent plans layer on top.

**Planned sequence:**

1. **Plan 1 — smoke test** (this plan) — stdio MCP + inline tool
2. Plan 2 — dispatcher pattern + `exec`/`compute` handlers + Mustache
3. Plan 3 — JSONLogic (`json-logic-engine`) + guards + transforms
4. Plan 4 — `connections:`, `probes:`, `http`/`graphql` handlers
5. Plan 5 — resources (+ watchers), prompts, completions, tasks (state machines)
6. CLI — `jig new|dev|validate|build` commands
7. Build pipeline — esbuild single-file bundling, `.mcpb` wrapping, `extension_points:` composition, HTTP transport

At the end of this plan, a handoff doc names the next plan and what changed.

## Key Constraints (enforce throughout)

- **Just-in-time scaffolding.** Nothing lands in `package.json`, `tsconfig.json`, or `justfile` until the code that uses it exists. No `bin:` entry until we produce a binary. No `build:` script until there's a build.
- **Output directory is `build/`**, never `dist/`. The stale scaffolding used `dist/`; we're explicitly not using that name.
- **SDK target is `@modelcontextprotocol/server@2.0.0-alpha.2` or later.** The 2.x tree (`/server`, `/client`, `/node`) is the target; 1.x is not a fallback. API surface may drift during alpha — wrap SDK usage in thin modules (`src/runtime/server.ts`, `src/runtime/transports/stdio.ts`) so changes are isolated.
- **TDD.** Each implementation step is preceded by a failing test and followed by the test passing.
- **Commits via `commit.txt`.** Every commit step writes the message to a file; Clay runs `gtxt` to commit. Never `git commit` directly.
- **No `dist/` references anywhere** — neither in code, comments, nor documentation.

## File Structure

```
jig/
  .gitignore                  # node_modules/, build/, .DS_Store, .private-journal/, .claude/
  package.json                # minimum: name, type:module, engines, deps, devDeps
  tsconfig.json               # strict ESM, NodeNext, allowImportingTsExtensions
  justfile                    # install, test, check, smoke — no build yet
  src/
    runtime/
      index.ts                # entry; arg parse, config load, server spin-up
      config.ts               # YAML loader + schema types + sibling discovery
      server.ts               # SDK adapter: create server, register handlers
      tools.ts                # parse tools from config, expose to server
      transports/
        stdio.ts              # SDK adapter: wire stdio transport
      handlers/
        inline.ts             # the only handler type in Plan 1
  tests/
    config.test.ts            # YAML loader tests
    tools.test.ts             # inline handler tests (unit)
    integration.test.ts       # spawns runtime subprocess, sends JSON-RPC
  examples/
    minimal.yaml              # one server, one tool, inline handler
```

**Not in Plan 1:** `src/runtime/resources.ts`, `prompts.ts`, `tasks.ts`, `handlers/exec.ts`, `http.ts`, `graphql.ts`, `dispatch.ts`, `compute.ts`, `util/template.ts`, `util/jsonlogic.ts`, `util/env.ts`, `src/cli/`, `config/default-bare.yaml`, `scripts/`, `src/runtime/transports/http.ts`. Each arrives in a later plan.

---

## Phase 0: Initial Commit (Clean Slate)

**Intent:** The repo has no commits yet; the working tree has both useful artifacts (design docs, ADRs, research) and stale scaffolding from a pre-design first pass. This phase lands the first commit with only what's worth keeping.

### Task 0.1: Delete stale scaffolding

**Files:**
- Delete: `package.json`, `tsconfig.json`, `justfile`, `scripts/build.mjs`, `scripts/`, `package-lock.json`, `node_modules/`, `.DS_Store`

- [ ] **Step 1: Remove stale files from the working tree**

```bash
rm -rf node_modules
rm -f package.json tsconfig.json justfile package-lock.json .DS_Store
rm -rf scripts
```

- [ ] **Step 2: Verify stale files are gone**

Run: `ls /Users/clay/source/claylo/jig`
Expected output (directories and dotfiles only, no `package.json` / `tsconfig.json` / `justfile` / `scripts/`):
```
.bito.yaml  .claude  .gitignore  .handoffs  .private-journal  record  ref
```

### Task 0.2: Augment `.gitignore` (minimal edits only)

**Files:**
- Modify: `.gitignore`

The existing `.gitignore` (committed in `bfedb1a`) is already in good shape — don't rewrite it. Open the file, check for two additions, and stop.

- [ ] **Step 1: Verify current contents**

Run: `cat .gitignore`
Expected (from commit `bfedb1a`):

```gitignore
node_modules/
dist/
*.log
.DS_Store
*.tsbuildinfo
.claude/
```

- [ ] **Step 2: Add `build/` and `.private-journal/` only if missing**

Append these two lines if they're not already present:

```gitignore
build/
.private-journal/
```

Do **not** delete the existing `dist/` line — it does no harm (nothing writes to `dist/`) and Clay has explicitly asked not to rewrite this file. The aim is minimal, targeted edits.

### Task 0.3: Commit design artifacts and `.gitignore` additions

The first commit (`bfedb1a`) has already landed `.gitignore`. This task commits the design phase output (ADRs, design doc, ref/ research, handoff), the `.gitignore` additions from Task 0.2, and this plan file.

- [ ] **Step 1: Verify git state**

Run: `git status`
Expected: staged additions for `record/decisions/*`, `record/designs/*`, `.handoffs/*`; `.gitignore` modified; untracked `.bito.yaml`, `record/plans/*`, `ref/*`. No `package.json`, `tsconfig.json`, `justfile`, or `scripts/` in any state (those were deleted in Task 0.1).

- [ ] **Step 2: Write `commit.txt`**

File: `commit.txt`

```
chore: land design artifacts and plan 1

Commits the design phase output (design doc, 5 ADRs, ref/ research
reports, session handoff) plus this plan file. Adds build/ and
.private-journal/ to .gitignore.

Stale first-pass scaffolding (package.json, tsconfig.json, justfile,
scripts/build.mjs) has been deleted rather than committed; plan 1
rebuilds scaffolding just-in-time in Phase 1.
```

- [ ] **Step 3: Stage and commit**

Clay: `git add -A && gtxt`

Expected: second commit lands. `git log --oneline` shows two commits.

---

## Phase 1: Minimum Scaffolding to Run a Test

**Intent:** Land only what's needed to run `node --test tests/smoke.test.ts` against a trivial assertion. No build script, no bin entry, no esbuild, no example YAML yet.

### Task 1.1: Create `package.json`

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write the file**

```json
{
  "name": "jig",
  "version": "1.0.0-alpha.0",
  "description": "YAML-driven single-file MCP server packaging tool",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "test": "node --test --experimental-transform-types 'tests/**/*.test.ts'",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "2.0.0-alpha.2",
    "yaml": "^2.8.3"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.0"
  }
}
```

Notes for the engineer:
- `bin`, `build`, `start`, `clean`, `dev` scripts are intentionally absent. Add them only when a binary, build, or runnable CLI exists.
- `@modelcontextprotocol/server@2.0.0-alpha.2` is the pinned alpha target per the handoff. If npm reports a later 2.x alpha at install time, bump to that version; do **not** fall back to `@modelcontextprotocol/sdk@1.x`.
- `--experimental-transform-types` is Node 24's native TypeScript loader; this avoids adding `tsx` or `ts-node`.

### Task 1.2: Create `tsconfig.json`

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Write the file**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "build"]
}
```

Notes:
- `noEmit: true` — we're not emitting `.js`; Node 24 transforms TypeScript at runtime and esbuild will bundle later.
- `allowImportingTsExtensions: true` — lets us write `import { x } from "./foo.ts"` explicitly, which Node 24's transform prefers.
- `exclude` references `build/`, not `dist/`.

### Task 1.3: Create `justfile`

**Files:**
- Create: `justfile`

- [ ] **Step 1: Write the file**

```just
# jig — YAML-driven single-file MCP server
# Plan 1 justfile. `build`, `run`, `smoke`, and `clean` recipes arrive in
# later phases as the things they build/run begin to exist.

default: check test

# Install deps
install:
    npm install

# Type-check the source
check:
    npm run check

# Run tests
test:
    npm test
```

### Task 1.4: Create source and test directory skeletons

**Files:**
- Create: `src/runtime/.gitkeep` (empty file, so the directory is committable)
- Create: `tests/.gitkeep`

- [ ] **Step 1: Create directories with placeholders**

```bash
mkdir -p src/runtime/transports src/runtime/handlers tests
touch src/runtime/.gitkeep tests/.gitkeep
```

These placeholders go away as real files land in Phase 2+; they exist so the directory structure is visible to the next reader and so the first commit doesn't skip the directories.

### Task 1.5: Write the sanity test

**Files:**
- Create: `tests/sanity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("node:test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

This passes trivially, but it smoke-tests the test tooling: TypeScript transform, test discovery, and assertion library.

- [ ] **Step 2: Install deps**

Run: `npm install`
Expected: deps resolve, `node_modules/` populated, no errors.

If `@modelcontextprotocol/server@2.0.0-alpha.2` is unpublished or replaced, run `npm view @modelcontextprotocol/server versions --json` to find the current alpha and pin to that.

- [ ] **Step 3: Run the test**

Run: `npm test`
Expected: one test passes. `node --test` reports something like `# tests 1`, `# pass 1`, `# fail 0`.

- [ ] **Step 4: Run typechecker**

Run: `npm run check`
Expected: no errors.

### Task 1.6: Commit Phase 1

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
chore: minimum scaffolding for TDD loop

Lands the smallest useful node/typescript setup: package.json with two
runtime deps (@modelcontextprotocol/server alpha, yaml) and a devDep on
@types/node + typescript, a strict tsconfig, a justfile with install/
check/test recipes only, and a single sanity test that verifies the
test runner and transform-types loader work.

No bin entry, no build script, no example configs, no esbuild. Those
land in their own commits when the things they produce exist.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt`

Expected: second commit lands.

---

## Phase 2: YAML Schema Types and Config Loader

**Intent:** Load a YAML file into a typed structure, either from `--config PATH` or from a sibling file next to the runtime entry. Validate the Plan 1 subset of the schema: `server` metadata and a `tools` array where each tool has an `inline` handler.

### Task 2.1: Define TypeScript types for the Plan 1 schema

**Files:**
- Create: `src/runtime/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test for type parsing**

Contents of `tests/config.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("parseConfig accepts a minimal valid config", () => {
  const yaml = `
server:
  name: example
  version: "0.1.0"
  description: A minimal example
tools:
  - name: ping
    description: Respond with pong
    input:
      message: { type: string }
    handler:
      inline:
        text: "pong"
`;
  const config = parseConfig(yaml);
  assert.equal(config.server.name, "example");
  assert.equal(config.server.version, "0.1.0");
  assert.equal(config.tools.length, 1);
  assert.equal(config.tools[0]!.name, "ping");
  assert.deepEqual(config.tools[0]!.handler, { inline: { text: "pong" } });
});

test("parseConfig rejects config missing server.name", () => {
  const yaml = `
server:
  version: "0.1.0"
tools: []
`;
  assert.throws(() => parseConfig(yaml), /server\.name/);
});

test("parseConfig rejects a tool without a handler", () => {
  const yaml = `
server: { name: example, version: "0.1.0" }
tools:
  - name: broken
    description: No handler
`;
  assert.throws(() => parseConfig(yaml), /handler/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/runtime/config.ts'`.

- [ ] **Step 3: Implement `parseConfig` in `src/runtime/config.ts`**

```typescript
import { parse as parseYaml } from "yaml";

export interface ServerMetadata {
  name: string;
  version: string;
  description?: string;
  instructions?: string;
}

export interface InputFieldSchema {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  description?: string;
}

export interface InlineHandler {
  inline: { text: string };
}

export type Handler = InlineHandler;
// Discriminated union expands in later plans: ExecHandler | HttpHandler | ...

export interface ToolDefinition {
  name: string;
  description: string;
  input?: Record<string, InputFieldSchema>;
  handler: Handler;
}

export interface JigConfig {
  server: ServerMetadata;
  tools: ToolDefinition[];
}

export function parseConfig(yamlText: string): JigConfig {
  const raw = parseYaml(yamlText) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("config: YAML root must be a mapping");
  }
  const obj = raw as Record<string, unknown>;

  const server = validateServer(obj["server"]);
  const tools = validateTools(obj["tools"]);

  return { server, tools };
}

function validateServer(v: unknown): ServerMetadata {
  if (!v || typeof v !== "object") {
    throw new Error("config: server block is required");
  }
  const s = v as Record<string, unknown>;
  if (typeof s["name"] !== "string" || s["name"].length === 0) {
    throw new Error("config: server.name is required and must be a string");
  }
  if (typeof s["version"] !== "string" || s["version"].length === 0) {
    throw new Error("config: server.version is required and must be a string");
  }
  return {
    name: s["name"],
    version: s["version"],
    description: typeof s["description"] === "string" ? s["description"] : undefined,
    instructions: typeof s["instructions"] === "string" ? s["instructions"] : undefined,
  };
}

function validateTools(v: unknown): ToolDefinition[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error("config: tools must be an array");
  }
  return v.map((entry, i) => validateTool(entry, i));
}

function validateTool(entry: unknown, index: number): ToolDefinition {
  if (!entry || typeof entry !== "object") {
    throw new Error(`config: tools[${index}] must be a mapping`);
  }
  const t = entry as Record<string, unknown>;
  if (typeof t["name"] !== "string" || t["name"].length === 0) {
    throw new Error(`config: tools[${index}].name is required`);
  }
  if (typeof t["description"] !== "string") {
    throw new Error(`config: tools[${index}].description is required`);
  }
  if (!t["handler"] || typeof t["handler"] !== "object") {
    throw new Error(`config: tools[${index}].handler is required`);
  }
  const handler = validateHandler(t["handler"], t["name"]);
  return {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler,
  };
}

function validateInput(
  v: unknown,
  toolName: string,
): Record<string, InputFieldSchema> | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].input must be a mapping`);
  }
  const out: Record<string, InputFieldSchema> = {};
  for (const [field, schema] of Object.entries(v)) {
    if (!schema || typeof schema !== "object") {
      throw new Error(`config: tools[${toolName}].input.${field} must be a mapping`);
    }
    const s = schema as Record<string, unknown>;
    if (typeof s["type"] !== "string") {
      throw new Error(`config: tools[${toolName}].input.${field}.type is required`);
    }
    out[field] = {
      type: s["type"] as InputFieldSchema["type"],
      required: s["required"] === true,
      description:
        typeof s["description"] === "string" ? s["description"] : undefined,
    };
  }
  return out;
}

function validateHandler(v: unknown, toolName: string): Handler {
  const h = v as Record<string, unknown>;
  if (h["inline"] && typeof h["inline"] === "object") {
    const inline = h["inline"] as Record<string, unknown>;
    if (typeof inline["text"] !== "string") {
      throw new Error(
        `config: tools[${toolName}].handler.inline.text must be a string`,
      );
    }
    return { inline: { text: inline["text"] } };
  }
  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (Plan 1 supports: inline)`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: three tests pass.

- [ ] **Step 5: Run typechecker**

Run: `npm run check`
Expected: no errors.

### Task 2.2: Resolve YAML path (`--config` or sibling)

**Files:**
- Modify: `src/runtime/config.ts` (append)
- Test: `tests/config.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/config.test.ts`:

```typescript
import { loadConfigFromFile, resolveConfigPath } from "../src/runtime/config.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("resolveConfigPath returns --config arg when provided", () => {
  const runtimeUrl = pathToFileURL("/opt/jig/server.mjs").href;
  const resolved = resolveConfigPath({
    argv: ["--config", "/tmp/custom.yaml"],
    runtimeUrl,
  });
  assert.equal(resolved, "/tmp/custom.yaml");
});

test("resolveConfigPath falls back to sibling jig.yaml", () => {
  const runtimeUrl = pathToFileURL("/opt/jig/server.mjs").href;
  const resolved = resolveConfigPath({ argv: [], runtimeUrl });
  assert.equal(resolved, "/opt/jig/jig.yaml");
});

test("loadConfigFromFile parses an on-disk file", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-test-"));
  const path = join(dir, "jig.yaml");
  writeFileSync(
    path,
    `server: { name: disk-example, version: "0.1.0" }
tools:
  - name: ping
    description: p
    handler: { inline: { text: "pong" } }
`,
  );
  try {
    const config = loadConfigFromFile(path);
    assert.equal(config.server.name, "disk-example");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `resolveConfigPath` and `loadConfigFromFile` are undefined exports.

- [ ] **Step 3: Implement in `src/runtime/config.ts`**

Append to `src/runtime/config.ts`:

```typescript
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ResolveArgs {
  argv: string[];
  /** `import.meta.url` of the runtime entry point. */
  runtimeUrl: string;
}

/**
 * Pick the YAML file path, preferring `--config PATH` on argv and falling
 * back to `<runtime-dir>/jig.yaml` (ADR-0005: sibling resolution from
 * import.meta.url so GUI MCP clients with unpredictable CWDs still find
 * the config).
 */
export function resolveConfigPath(args: ResolveArgs): string {
  const idx = args.argv.indexOf("--config");
  if (idx !== -1 && idx + 1 < args.argv.length) {
    return args.argv[idx + 1]!;
  }
  const runtimeDir = dirname(fileURLToPath(args.runtimeUrl));
  return `${runtimeDir}/jig.yaml`;
}

export function loadConfigFromFile(path: string): JigConfig {
  const text = readFileSync(path, "utf8");
  return parseConfig(text);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all six tests pass.

- [ ] **Step 5: Run typechecker**

Run: `npm run check`
Expected: no errors.

### Task 2.3: Commit Phase 2

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
feat(runtime): YAML config loader with sibling-path discovery

Implements parseConfig for the Plan 1 schema subset: server block and
tools[] with inline handler. Validates required fields and throws with
a field-path message when a required field is absent.

Adds resolveConfigPath + loadConfigFromFile so the runtime can find its
config from --config PATH or, failing that, from jig.yaml next to the
running .mjs (ADR-0005). Path resolution takes import.meta.url so GUI
MCP clients with unpredictable working directories still land on the
right file.

Exec/http/graphql/dispatch/compute handler types, Mustache templating,
env-var expansion, and JSONLogic guards are deliberately out of scope
here and arrive in Plan 2 (dispatcher) and Plan 3 (JSONLogic).
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt`

---

## Phase 3: MCP Server Skeleton over stdio

**Intent:** Spin up an MCP server instance, wire it to stdio transport, and confirm it responds to the `initialize` handshake. No tools registered yet.

### Task 3.1: Spike the SDK surface

**Files:** (none — this is a read/research step)

- [ ] **Step 1: Read the installed SDK's exports**

Because `@modelcontextprotocol/server@2.x` is fresh alpha, the source-of-truth is the installed package, not any documentation:

```bash
cat node_modules/@modelcontextprotocol/server/package.json | jq '.exports, .main, .types'
ls node_modules/@modelcontextprotocol/server/dist 2>/dev/null || \
  ls node_modules/@modelcontextprotocol/server
```

Read the package README and any bundled examples. Identify:

1. The server class (probably exported as `Server`, `MCPServer`, or similar — confirm the name).
2. How to register request handlers for `initialize`, `tools/list`, `tools/call`.
3. The stdio transport — either exported from `@modelcontextprotocol/server` directly, or from a separate entry point. In 1.x it lived at `@modelcontextprotocol/sdk/server/stdio.js`; the 2.x split may have moved it.
4. Capability declaration syntax (what shape does the server pass to signal `tools` support?).

Document your findings as a short comment block at the top of `src/runtime/server.ts` before writing any code against the SDK. If the API diverges materially from the shapes shown below, update the code samples in this task inline — this plan is a working document.

- [ ] **Step 2: Confirm `initialize` wire format**

The MCP 2025-11-25 `initialize` request is:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "<client>", "version": "<v>" }
  } }
```

The response must include `protocolVersion`, `serverInfo { name, version }`, and `capabilities`. If the SDK builds this response for us, we pass `serverInfo` and `capabilities`; if not, we build it by hand. Note which shape the installed SDK version requires.

### Task 3.2: Create the SDK adapter module

**Files:**
- Create: `src/runtime/server.ts`

- [ ] **Step 1: Write the adapter**

`src/runtime/server.ts` wraps the SDK's server class so that a later SDK API change only touches this one file. Shape (adapt names/imports to what Task 3.1 found):

```typescript
// SDK adapter. All direct imports of @modelcontextprotocol/server live here.
// Rationale: SDK 2.x is fresh alpha and its API may shift before 2.0 ships.
// Keeping adapter logic pinned to this module means an API change is a
// one-file edit, not a grep-and-replace.

import { Server } from "@modelcontextprotocol/server"; // <-- adjust to actual export
import type { JigConfig } from "./config.ts";

export interface JigServerHandle {
  /** Invoked by the transport when a tool is called. */
  onToolsCall(handler: (name: string, args: unknown) => Promise<unknown>): void;
  /** Invoked by the transport when the client lists tools. */
  onToolsList(handler: () => Promise<unknown>): void;
  /** Hand the server to a transport and begin serving. */
  connect(transport: unknown): Promise<void>;
}

export function createServer(config: JigConfig): JigServerHandle {
  const server = new Server(
    {
      name: config.server.name,
      version: config.server.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // The exact method names below (setRequestHandler, notation "tools/list",
  // etc.) are SDK 2.x placeholders. Confirm and adjust during Task 3.1.
  return {
    onToolsList(handler) {
      // server.setRequestHandler("tools/list", handler)
      server.setRequestHandler("tools/list", async () => handler());
    },
    onToolsCall(handler) {
      server.setRequestHandler("tools/call", async (req: any) => {
        const { name, arguments: args } = req.params;
        return handler(name, args);
      });
    },
    async connect(transport) {
      await server.connect(transport as any);
    },
  };
}
```

If the installed SDK exposes a richer typed API, replace the `any` casts with the real types. Do not leak `any` beyond this file.

- [ ] **Step 2: Run the typechecker**

Run: `npm run check`
Expected: no errors. If the typechecker complains about unknown SDK exports, fix the adapter until it's clean.

### Task 3.3: Wire stdio transport

**Files:**
- Create: `src/runtime/transports/stdio.ts`

- [ ] **Step 1: Write the transport adapter**

```typescript
// SDK adapter for stdio transport. See src/runtime/server.ts for the
// rationale — keep all direct SDK imports quarantined here.

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
// ^ adjust path to match the 2.x SDK. In 1.x it was
//   "@modelcontextprotocol/sdk/server/stdio.js". Confirm during Task 3.1.

export function createStdioTransport(): unknown {
  return new StdioServerTransport();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors.

### Task 3.4: Entry point `index.ts`

**Files:**
- Create: `src/runtime/index.ts`

- [ ] **Step 1: Write the entry**

```typescript
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer } from "./server.ts";
import { createStdioTransport } from "./transports/stdio.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

  const server = createServer(config);

  // Tool handlers are wired in Task 4.3. For now, both handlers return
  // empty results so the server responds cleanly to `initialize` and
  // `tools/list`.
  server.onToolsList(async () => ({ tools: [] }));
  server.onToolsCall(async (name) => {
    throw new Error(`unknown tool: ${name}`);
  });

  await server.connect(createStdioTransport());
}

main().catch((err) => {
  process.stderr.write(`jig runtime fatal: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors.

### Task 3.5: Integration test for `initialize`

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function sendRpc(
  serverPath: string,
  configPath: string,
  requests: object[],
): Promise<RpcResponse[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", serverPath, "--config", configPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(
          new Error(
            `runtime exited with code ${code}. stderr: ${stderrChunks.join("")}`,
          ),
        );
        return;
      }
      const lines = stdoutChunks
        .join("")
        .split("\n")
        .filter((l) => l.trim().length > 0);
      try {
        const parsed = lines.map((l) => JSON.parse(l) as RpcResponse);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`parse error: ${(e as Error).message}. stdout: ${stdoutChunks.join("")}`));
      }
    });

    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + "\n");
    }
    child.stdin.end();
  });
}

test("initialize returns serverInfo matching config", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-int-"));
  const configPath = join(dir, "jig.yaml");
  writeFileSync(
    configPath,
    `server: { name: test-init, version: "9.9.9" }
tools: []
`,
  );
  try {
    const responses = await sendRpc(
      join(process.cwd(), "src/runtime/index.ts"),
      configPath,
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
          },
        },
      ],
    );
    assert.equal(responses.length, 1);
    const init = responses[0]!;
    assert.equal(init.id, 1);
    // SDK's exact response shape may vary; assert the pieces we care
    // about without over-specifying structure.
    const result = init.result as { serverInfo: { name: string; version: string } };
    assert.equal(result.serverInfo.name, "test-init");
    assert.equal(result.serverInfo.version, "9.9.9");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails (or passes, depending on SDK defaults)**

Run: `npm test`
Expected: Either FAIL because the SDK doesn't yet behave as wired, or PASS if Task 3.2's adapter wired correctly. If it fails, iterate on `server.ts` and `index.ts` until the initialize round-trip works. Common failure modes: incorrect import path for stdio transport, misspelled request-handler method names, missing capability declaration.

**Do not move on until this test passes.** This is the core smoke check that the SDK adapter is sane.

- [ ] **Step 3: Re-run typechecker**

Run: `npm run check`
Expected: no errors.

### Task 3.6: Commit Phase 3

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
feat(runtime): stdio MCP server skeleton with SDK adapter

Wires @modelcontextprotocol/server 2.x alpha: a Server instance, a stdio
transport, and request handlers for tools/list and tools/call. The SDK
is touched only through src/runtime/server.ts and
src/runtime/transports/stdio.ts so a future alpha API change is a
two-file edit.

Adds src/runtime/index.ts as the entry point: parse argv, resolve
--config or sibling jig.yaml, build the server, connect over stdio.
The initialize handshake now returns serverInfo derived from YAML.

tools/list returns empty and tools/call throws "unknown tool" — both
get real logic in Phase 4.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt`

---

## Phase 4: Inline-Handler Tools

**Intent:** Register the tools declared in YAML with the MCP server, synthesize an `inputSchema` from the YAML `input:` block, and route `tools/call` invocations to the `inline` handler.

### Task 4.1: Generate `inputSchema` from YAML input block

**Files:**
- Create: `src/runtime/tools.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ToolDefinition } from "../src/runtime/config.ts";
import { toolToInputSchema } from "../src/runtime/tools.ts";

test("toolToInputSchema handles no input block", () => {
  const tool: ToolDefinition = {
    name: "noop",
    description: "x",
    handler: { inline: { text: "ok" } },
  };
  assert.deepEqual(toolToInputSchema(tool), {
    type: "object",
    properties: {},
  });
});

test("toolToInputSchema maps a typed field", () => {
  const tool: ToolDefinition = {
    name: "greet",
    description: "x",
    input: {
      name: { type: "string", required: true, description: "Who to greet" },
      loud: { type: "boolean" },
    },
    handler: { inline: { text: "ok" } },
  };
  assert.deepEqual(toolToInputSchema(tool), {
    type: "object",
    properties: {
      name: { type: "string", description: "Who to greet" },
      loud: { type: "boolean" },
    },
    required: ["name"],
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/runtime/tools.ts'`.

- [ ] **Step 3: Implement in `src/runtime/tools.ts`**

```typescript
import type { ToolDefinition } from "./config.ts";

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export function toolToInputSchema(tool: ToolDefinition): JsonSchemaObject {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  if (tool.input) {
    for (const [field, schema] of Object.entries(tool.input)) {
      const prop: { type: string; description?: string } = { type: schema.type };
      if (schema.description) prop.description = schema.description;
      properties[field] = prop;
      if (schema.required) required.push(field);
    }
  }
  const out: JsonSchemaObject = { type: "object", properties };
  if (required.length > 0) out.required = required;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: both new tests pass plus existing ones.

### Task 4.2: Implement the inline handler

**Files:**
- Create: `src/runtime/handlers/inline.ts`
- Test: `tests/tools.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/tools.test.ts`:

```typescript
import { invokeInline } from "../src/runtime/handlers/inline.ts";

test("invokeInline returns the configured text as an MCP content block", () => {
  const result = invokeInline({ inline: { text: "pong" } });
  assert.deepEqual(result, {
    content: [{ type: "text", text: "pong" }],
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/runtime/handlers/inline.ts'`.

- [ ] **Step 3: Implement in `src/runtime/handlers/inline.ts`**

```typescript
import type { InlineHandler } from "../config.ts";

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function invokeInline(handler: InlineHandler): ToolCallResult {
  return {
    content: [{ type: "text", text: handler.inline.text }],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all tests pass.

### Task 4.3: Register tools with the server

**Files:**
- Modify: `src/runtime/tools.ts` (append a registry)
- Modify: `src/runtime/index.ts` (wire registry into server)

- [ ] **Step 1: Extend `src/runtime/tools.ts`**

Append to `src/runtime/tools.ts`:

```typescript
import type { JigConfig, ToolDefinition } from "./config.ts";
import { invokeInline } from "./handlers/inline.ts";
import type { ToolCallResult } from "./handlers/inline.ts";

export interface ToolListEntry {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

export class ToolRegistry {
  private readonly byName: Map<string, ToolDefinition>;

  constructor(config: JigConfig) {
    this.byName = new Map(config.tools.map((t) => [t.name, t]));
  }

  list(): ToolListEntry[] {
    return [...this.byName.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toolToInputSchema(t),
    }));
  }

  async call(name: string, _args: unknown): Promise<ToolCallResult> {
    const tool = this.byName.get(name);
    if (!tool) {
      throw new Error(`unknown tool: ${name}`);
    }
    // Plan 1 supports only inline handlers. Arg validation, dispatcher
    // routing, exec/http/graphql invocation, and Mustache interpolation
    // all arrive in subsequent plans.
    if ("inline" in tool.handler) {
      return invokeInline(tool.handler);
    }
    throw new Error(`tool ${name}: no handler implementation for this type`);
  }
}
```

- [ ] **Step 2: Wire the registry in `src/runtime/index.ts`**

Replace the `server.onToolsList` and `server.onToolsCall` stubs in `src/runtime/index.ts` with:

```typescript
import { ToolRegistry } from "./tools.ts";
// ... existing imports ...

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

  const registry = new ToolRegistry(config);
  const server = createServer(config);

  server.onToolsList(async () => ({ tools: registry.list() }));
  server.onToolsCall(async (name, args) => registry.call(name, args));

  await server.connect(createStdioTransport());
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no errors.

### Task 4.4: Integration test — `tools/list` and `tools/call`

**Files:**
- Modify: `tests/integration.test.ts` (append)

- [ ] **Step 1: Append the test**

```typescript
test("tools/list and tools/call round-trip for an inline tool", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-int-"));
  const configPath = join(dir, "jig.yaml");
  writeFileSync(
    configPath,
    `server: { name: call-test, version: "0.0.1" }
tools:
  - name: ping
    description: Respond with pong
    input:
      message: { type: string }
    handler:
      inline:
        text: "pong"
`,
  );
  try {
    const responses = await sendRpc(
      join(process.cwd(), "src/runtime/index.ts"),
      configPath,
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
        },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "ping", arguments: { message: "hi" } },
        },
      ],
    );
    assert.equal(responses.length, 3);
    const list = responses[1]!.result as { tools: Array<{ name: string }> };
    assert.equal(list.tools.length, 1);
    assert.equal(list.tools[0]!.name, "ping");

    const call = responses[2]!.result as {
      content: Array<{ type: string; text: string }>;
    };
    assert.equal(call.content[0]!.text, "pong");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npm test`
Expected: all integration tests pass, including `tools/list`/`tools/call`.

If the SDK wraps `tools/list` or `tools/call` responses differently than assumed, adjust the assertions to match the observed shape. The test's job is to confirm the round trip works, not to over-constrain the SDK's output.

### Task 4.5: Commit Phase 4

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
feat(runtime): inline handler with tool registry

Introduces ToolRegistry (src/runtime/tools.ts) that owns the name →
ToolDefinition map, synthesizes inputSchema from the YAML input:
block, and routes tools/call invocations to the matching handler.

The inline handler (src/runtime/handlers/inline.ts) is the only
handler type implemented in Plan 1: it returns the configured text as an
MCP text content block. exec, http, graphql, dispatch, and compute
handlers land in later plans.

Input arg validation (per-field required checks, per-action requires
under dispatch) is deferred to the dispatcher plan — Plan 1 tools have
no dispatcher, so the inputSchema alone gives clients enough to
construct valid calls.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt`

---

## Phase 5: Example and Smoke Target

**Intent:** Give an end-user-style way to exercise the runtime from the command line with a real YAML file, and add a `just smoke` recipe that performs a full `initialize` round trip against it.

### Task 5.1: Write the minimal example

**Files:**
- Create: `examples/minimal.yaml`

- [ ] **Step 1: Write the file**

```yaml
# Minimal jig.yaml — a single tool with an inline handler.
# Plan 2 expands this into a dispatcher-style example.

server:
  name: jig-minimal
  version: "1.0.0"
  description: |
    The smallest useful jig example — one tool, one inline response.
    Meant as the Plan 1 smoke-test target.

tools:
  - name: hello
    description: Say hello. Useful only as a reachability probe.
    input:
      name:
        type: string
        description: Who to greet. Ignored in Plan 1; preserved for Plan 2.
    handler:
      inline:
        text: "Hello from jig!"
```

### Task 5.2: Add the `smoke` recipe to `justfile`

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Append the smoke recipe**

Append to `justfile`:

```just
# Smoke test: launch the runtime against examples/minimal.yaml, send one
# initialize request, print the response. Exit non-zero if the
# initialize response doesn't arrive on stdout.
smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    req='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
    response=$(echo "$req" | node --experimental-transform-types src/runtime/index.ts --config examples/minimal.yaml | head -1)
    if [ -z "$response" ]; then
      echo "smoke: no response from runtime" >&2
      exit 1
    fi
    echo "$response" | jq .
```

- [ ] **Step 2: Run the smoke target**

Run: `just smoke`
Expected: a JSON-RPC response prints with `serverInfo.name == "jig-minimal"` and `capabilities.tools` present. Exit code 0.

If `just smoke` hangs, the runtime isn't closing stdin properly — check that the SDK's stdio transport exits when stdin is closed, not after some timeout.

### Task 5.3: Verification pass

- [ ] **Step 1: Run all quality gates**

```bash
npm run check
npm test
just smoke
```

Expected: all three succeed. If `npm test` and `just smoke` disagree (e.g., integration test passes but smoke hangs), prefer the smoke signal — it's closer to real client behavior.

### Task 5.4: Write the handoff for plan 2

**Files:**
- Create: `.handoffs/YYYY-MM-DD-jig-runtime-plan1-complete.md` (use the actual completion date)

- [ ] **Step 1: Invoke the `building-in-the-open:curating-context` skill**

This hand-off doc is public and should use the curating-context process: tone firewall, token budget, "what changed / what's next / landmines" structure. Don't freelance the format.

Contents should cover:

- **State:** green, Plan 1 runtime passing all tests and `just smoke`
- **What changed:** phases 0–5, links to commits
- **What's next:** Plan 2 (dispatcher + exec + Mustache), which lives in `record/plans/` next to this plan
- **Landmines:** any SDK 2.x API surprises encountered during Task 3.1, any places where the plan's example code had to be adjusted during implementation

### Task 5.5: Commit Phase 5

**Files:**
- Create: `commit.txt`

- [ ] **Step 1: Write the commit message**

```
feat(runtime): minimal example and smoke target

Adds examples/minimal.yaml — a single-tool config with an inline
handler — and `just smoke`, which launches the runtime against it,
sends one initialize request, and prints the response.

This completes the Plan 1 smoke-test path: the runtime parses YAML,
speaks MCP over stdio, lists a tool, and returns a response from
tools/call. Plan 2 (dispatcher + exec + Mustache) builds on this
scaffold.
```

- [ ] **Step 2: Stage and commit**

Clay: `git add -A && gtxt`

---

## Self-Review (performed before handing the plan to an executor)

**1. Spec coverage (against design doc and handoff):**

- [x] YAML-driven: Phases 2 + 4 parse server/tools from YAML.
- [x] Sibling YAML discovery from `import.meta.url`: Task 2.2 (ADR-0005).
- [x] SDK 2.x target: pinned in Task 1.1, adapted in Tasks 3.1–3.3.
- [x] stdio transport: Task 3.3.
- [x] initialize handshake returns serverInfo from YAML: Task 3.5.
- [x] tools/list returns configured tools with inputSchema: Tasks 4.1 + 4.3.
- [x] tools/call routes to handler and returns MCP content: Tasks 4.2 + 4.3.
- [x] Smoke-test target operational: Task 5.2.

**Explicitly out of scope (documented in Scope Note):** dispatcher pattern, typed-field `requires:` validation, `exec`/`http`/`graphql`/`compute`/`dispatch` handlers, Mustache templating, JSONLogic, `connections:`, `probes:`, resources (watchers), prompts, completions, tasks (state machines), `extension_points:`, `user_config:`, CLI (`new`/`dev`/`validate`/`build`), esbuild build pipeline, `.mcpb` wrapping, HTTP transport, `--bare` builds, feature-opt-in bundles (`--with-oauth`), ADR-0001 dispatcher typed-flat-field mechanics. All of these go in plans 2–7.

**2. Placeholder scan:**

- No `TBD`, `TODO`, `implement later` in any task step.
- Every step with code has the actual code.
- Integration test includes the full `sendRpc` helper.
- SDK adapter acknowledges the API may diverge, but every field and method name used is the engineer's hypothesis to verify, not a placeholder.

**3. Type consistency:**

- `JigConfig`, `ServerMetadata`, `ToolDefinition`, `InlineHandler`, `Handler`, `InputFieldSchema` are all declared in Task 2.1 (`src/runtime/config.ts`) and imported consistently across Tasks 3.x and 4.x.
- `ToolCallResult` declared in Task 4.2 (`src/runtime/handlers/inline.ts`), returned from `ToolRegistry.call()` in Task 4.3.
- `JsonSchemaObject` declared in Task 4.1, returned from `toolToInputSchema()`.
- `JigServerHandle`'s `onToolsList`/`onToolsCall` signatures in Task 3.2 match the registry shape in Task 4.3 (`() => Promise<{ tools: ToolListEntry[] }>` and `(name: string, args: unknown) => Promise<ToolCallResult>`).

**4. Commit discipline:**

Every commit step uses `commit.txt` + `gtxt`, never direct `git commit`.

**5. Output directory:**

`build/` everywhere (in `.gitignore`, `tsconfig.json` excludes). No `dist/` references.

---

## Execution Handoff

Plan complete and saved to `record/plans/2026-04-14-jig-runtime-plan1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task (or per phase), review between tasks, fast iteration. Best fit for this plan because the SDK 2.x alpha surface will almost certainly require in-implementation adjustments; a subagent per phase keeps context focused on the current SDK shape.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
