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
