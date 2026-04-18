import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";
import { compileConnections, resolveHeaders } from "../src/runtime/connections.ts";
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
// Side-effect import: registers helpers (env.get, etc.) on the shared engine.
import "../src/runtime/util/helpers.ts";

test("config parses a connections: block and expands ${VAR} in headers", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections:
  linear_api:
    url: https://api.linear.app/graphql
    headers:
      Authorization: "Bearer \${LINEAR_API_TOKEN}"
    timeout_ms: 30000
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.connections, "connections: should be present on config");
  const linear = cfg.connections["linear_api"]!;
  assert.equal(linear.url, "https://api.linear.app/graphql");
  assert.equal(linear.timeout_ms, 30000);
  // Authorization header should be a JSONLogic rule after shim expansion.
  assert.deepEqual(linear.headers!["Authorization"], {
    cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
  });
});

test("config accepts an empty connections: block", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections: {}
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.connections, {});
});

test("config omits connections when the YAML has no block", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.connections, undefined);
});

test("config parses server.security.network.allow", () => {
  const yamlText = `
version: "1"
server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: ["api.linear.app", "*.github.com"]
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.server.security?.network?.allow, [
    "api.linear.app",
    "*.github.com",
  ]);
});

test("config rejects non-string entries in security.network.allow", () => {
  const yamlText = `
version: "1"
server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: [42]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /security\.network\.allow.*non-empty strings/);
});

test("config rejects connections without url", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections:
  bad:
    headers: { X: "y" }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections\.bad\.url/);
});

test("config rejects connections with unknown keys", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections:
  bad:
    url: https://example.com
    wat: "no"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections\.bad: unknown key "wat"/);
});

test("config rejects connections with non-positive timeout_ms", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections:
  bad:
    url: https://example.com
    timeout_ms: 0
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /timeout_ms.*positive/);
});

test("config rejects connections as an array", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
connections: [1, 2]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /connections.*mapping/);
});

test("compileConnections splits literal and rule headers", () => {
  const raw = {
    linear_api: {
      url: "https://api.linear.app/graphql",
      headers: {
        "X-Static": "literal-value",
        Authorization: { "env.get": ["LINEAR_API_TOKEN"] },
      },
      timeout_ms: 30000,
    },
  };
  const compiled = compileConnections(raw);
  const c = compiled["linear_api"]!;
  assert.equal(c.url, "https://api.linear.app/graphql");
  assert.equal(c.timeout_ms, 30000);
  assert.equal(c.headers.length, 2);
  const staticHeader = c.headers.find((h) => h.name === "X-Static")!;
  assert.equal(staticHeader.kind, "literal");
  const authHeader = c.headers.find((h) => h.name === "Authorization")!;
  assert.equal(authHeader.kind, "rule");
});

test("resolveHeaders evaluates rule-typed headers against the env allowlist", async () => {
  resetAccessForTests();
  configureAccess(
    { env: { allow: ["JIG_HEADERS_TEST_TOKEN"] } },
    process.cwd(),
  );
  process.env["JIG_HEADERS_TEST_TOKEN"] = "sekret";
  try {
    const raw = {
      t: {
        url: "https://example.com",
        headers: {
          Authorization: {
            cat: ["Bearer ", { "env.get": ["JIG_HEADERS_TEST_TOKEN"] }],
          },
        },
      },
    };
    const compiled = compileConnections(raw);
    const resolved = await resolveHeaders(compiled["t"]!);
    assert.equal(resolved["Authorization"], "Bearer sekret");
  } finally {
    delete process.env["JIG_HEADERS_TEST_TOKEN"];
    resetAccessForTests();
  }
});

test("resolveHeaders stringifies null for env vars outside the allowlist", async () => {
  resetAccessForTests();
  configureAccess({ env: { allow: ["JIG_OTHER"] } }, process.cwd());
  try {
    const raw = {
      t: {
        url: "https://example.com",
        headers: {
          X: { "env.get": ["SOMETHING_NOT_ALLOWED"] },
        },
      },
    };
    const compiled = compileConnections(raw);
    const resolved = await resolveHeaders(compiled["t"]!);
    assert.equal(resolved["X"], "null");
  } finally {
    resetAccessForTests();
  }
});
