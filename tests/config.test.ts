import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfigFromFile, parseConfig, resolveConfigPath } from "../src/runtime/config.ts";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

test("parseConfig accepts a tool with an exec handler", () => {
  const yaml = `
server: { name: e, version: "0.1.0" }
tools:
  - name: runner
    description: runs a script
    handler:
      exec: "/bin/echo hello"
`;
  const config = parseConfig(yaml);
  assert.deepEqual(config.tools[0]!.handler, { exec: "/bin/echo hello" });
});

test("parseConfig accepts a dispatcher tool", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: linear
    description: issue tracker
    input:
      action: { type: string, required: true }
      id: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          get:
            requires: [id]
            handler:
              exec: "/bin/echo {{id}}"
          search:
            handler:
              inline: { text: "no results" }
`;
  const config = parseConfig(yaml);
  const handler = config.tools[0]!.handler;
  assert.ok("dispatch" in handler);
  assert.equal(handler.dispatch.on, "action");
  assert.deepEqual(Object.keys(handler.dispatch.cases), ["get", "search"]);
  assert.deepEqual(handler.dispatch.cases["get"]!.requires, ["id"]);
});

test("parseConfig rejects a dispatcher with zero cases", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: empty
    description: x
    handler:
      dispatch:
        on: action
        cases: {}
`;
  assert.throws(() => parseConfig(yaml), /at least one case/i);
});

test("parseConfig rejects a dispatcher missing the on field", () => {
  const yaml = `
server: { name: d, version: "0.1.0" }
tools:
  - name: no-on
    description: x
    handler:
      dispatch:
        cases:
          foo:
            handler: { inline: { text: "f" } }
`;
  assert.throws(() => parseConfig(yaml), /dispatch\.on/i);
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

test("parseConfig treats missing security block as undefined (defaults applied at configureAccess)", () => {
  const yaml = `
server: { name: s, version: "0.1.0" }
tools: []
`;
  const config = parseConfig(yaml);
  assert.equal(config.server.security, undefined);
});

test("parseConfig accepts a full security block", () => {
  const yaml = `
server:
  name: s
  version: "0.1.0"
  security:
    filesystem:
      allow:
        - "."
        - "$HOME/.config"
    env:
      allow:
        - "JIG_*"
        - "HOME"
tools: []
`;
  const config = parseConfig(yaml);
  assert.ok(config.server.security);
  assert.deepEqual(config.server.security.filesystem?.allow, [".", "$HOME/.config"]);
  assert.deepEqual(config.server.security.env?.allow, ["JIG_*", "HOME"]);
});

test("parseConfig rejects non-array security.filesystem.allow", () => {
  const yaml = `
server:
  name: s
  version: "0.1.0"
  security:
    filesystem:
      allow: "not-an-array"
tools: []
`;
  assert.throws(() => parseConfig(yaml), /security\.filesystem\.allow/);
});

test("parseConfig rejects unknown top-level security keys", () => {
  const yaml = `
server:
  name: s
  version: "0.1.0"
  security:
    bogus: true
tools: []
`;
  assert.throws(() => parseConfig(yaml), /security: unknown key "bogus"/);
});

test("parseConfig accepts a tool with a compute handler", () => {
  const yaml = `
server: { name: c, version: "0.1.0" }
tools:
  - name: now
    description: current time
    handler:
      compute: { "time.now": [] }
`;
  const config = parseConfig(yaml);
  const handler = config.tools[0]!.handler;
  assert.ok("compute" in handler);
  assert.deepEqual((handler as { compute: unknown }).compute, { "time.now": [] });
});

test("parseConfig accepts a tool with a transform", () => {
  const yaml = `
server: { name: t, version: "0.1.0" }
tools:
  - name: wrap
    description: demo
    handler:
      inline: { text: "raw" }
    transform:
      cat: ["wrapped(", { var: "result" }, ")"]
`;
  const config = parseConfig(yaml);
  const tool = config.tools[0]!;
  assert.ok(tool.transform);
  assert.deepEqual(tool.transform, {
    cat: ["wrapped(", { var: "result" }, ")"],
  });
});

test("config accepts an http handler with connection + method", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      http:
        connection: api
        method: GET
        path: "/thing"
`;
  const cfg = parseConfig(yamlText);
  const h = cfg.tools[0]!.handler as { http: { method: string; path?: string } };
  assert.equal(h.http.method, "GET");
  assert.equal(h.http.path, "/thing");
});

test("config rejects http without connection or url", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler:
      http:
        method: GET
`;
  assert.throws(() => parseConfig(yamlText), /http requires either connection or url/);
});

test("config rejects http with invalid method", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler:
      http:
        connection: api
        method: BOGUS
connections:
  api:
    url: https://example.com
`;
  assert.throws(() => parseConfig(yamlText), /http\.method/);
});

test("config rejects http with unknown keys", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      http:
        connection: api
        method: GET
        respons: envelope
`;
  assert.throws(() => parseConfig(yamlText), /http: unknown key "respons"/);
});

test("config accepts a graphql handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      graphql:
        connection: api
        query: "query { x }"
`;
  const cfg = parseConfig(yamlText);
  const h = cfg.tools[0]!.handler as { graphql: { connection: string; query: string } };
  assert.equal(h.graphql.connection, "api");
  assert.match(h.graphql.query, /^query/);
});

test("config rejects graphql without a query", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
tools:
  - name: t1
    description: x
    handler:
      graphql:
        connection: api
`;
  assert.throws(() => parseConfig(yamlText), /graphql\.query/);
});

test("config rejects graphql with unknown keys", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
tools:
  - name: t1
    description: x
    handler:
      graphql:
        connection: api
        query: "{ x }"
        bogus: x
`;
  assert.throws(() => parseConfig(yamlText), /graphql: unknown key "bogus"/);
});

test("config accepts a tool with execution.taskSupport: required", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: ok } }
tools:
  - name: longjob
    description: "Long-running job"
    execution:
      taskSupport: required
    handler:
      workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools.length, 1);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "required");
});

test("config accepts a tool with execution.taskSupport: optional", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: ok } }
tools:
  - name: pollable
    description: "May be called either way"
    execution:
      taskSupport: optional
    handler:
      workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
});

test("config accepts a tool without execution: (default = non-task)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: plain
    description: "Plain tool"
    handler:
      inline: { text: ok }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution, undefined);
});

test("config rejects execution: that isn't a mapping", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution: required
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution must be a mapping/);
});

test("config rejects execution: with no taskSupport", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution: {}
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution\.taskSupport is required/);
});

test("config rejects execution.taskSupport: forbidden", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: forbidden
    handler:
      inline: { text: ok }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /taskSupport must be one of "required", "optional"/,
  );
});

test("config rejects execution.taskSupport: bogus value", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: maybe
    handler:
      inline: { text: ok }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /taskSupport must be one of "required", "optional"/,
  );
});

test("config rejects execution: with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
      bogus: 42
    handler:
      inline: { text: ok }
`;
  assert.throws(() => parseConfig(yamlText), /execution: unknown key "bogus"/);
});
