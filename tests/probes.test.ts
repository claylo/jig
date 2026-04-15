import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a probes: block with a single graphql probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
probes:
  teams:
    graphql:
      connection: api
      query: "{ teams { name } }"
tools:
  - name: t1
    description: x
    handler:
      inline:
        text: ok
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes, "probes must be present");
  const p = cfg.probes["teams"];
  assert.ok(p, "teams probe must be present");
  assert.equal((p.handler as { graphql: { connection: string } }).graphql.connection, "api");
});

test("config accepts http and exec probes", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  status:
    http:
      connection: api
      method: GET
      path: /status
  git_sha:
    exec: "git rev-parse HEAD"
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes!["status"]?.handler);
  assert.equal((cfg.probes!["git_sha"]?.handler as { exec: string }).exec, "git rev-parse HEAD");
});

test("config rejects a probe with no handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  bare:
    timeout_ms: 1000
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /must declare exactly one of graphql, http, exec \(got none\)/);
});

test("config rejects a probe with two handlers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  conflicted:
    http: { connection: api, method: GET }
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /got http, exec/);
});

test("config rejects an unknown key in a probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  weird:
    exec: "echo hi"
    bogus: 42
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probes\.weird: unknown key "bogus"/);
});

test("config rejects probe names that aren't Mustache-safe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  "bad.name":
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probe names must match/);
});

test("config rejects negative timeout_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  slow:
    exec: "echo hi"
    timeout_ms: -1
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /timeout_ms must be a positive number/);
});

test("config accepts a probe with a map: rule (no structural check at parse time)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  shaped:
    exec: "echo hi"
    map:
      var: "result"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.probes!["shaped"]?.map, { var: "result" });
});

test("config accepts a server with no probes block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.probes, undefined);
});

test("config rejects probes: null at the top level", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: ~
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects probes: as an array at the top level", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: []
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects probes: as a scalar string", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: "oops"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects a probe entry that is null", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  broken: ~
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes\.broken must be a mapping/);
});

test("config rejects a probe entry that is an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  broken: []
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes\.broken must be a mapping/);
});
