import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a resources: block with a single static-uri resource", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    description: A greeting
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.resources, "resources must be present");
  assert.equal(cfg.resources.length, 1);
  const r = cfg.resources[0]!;
  assert.equal(r.uri, "config://jig/hello");
  assert.equal(r.name, "Hello");
  assert.equal(r.mimeType, "text/plain");
  assert.ok("inline" in r.handler);
});

test("config accepts resources with polling and file watchers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: queue://jobs
    name: Jobs
    handler: { inline: { text: "[]" } }
    watcher:
      type: polling
      interval_ms: 5000
  - uri: file:///tmp/state.json
    name: State
    handler: { exec: "cat /tmp/state.json" }
    watcher:
      type: file
      path: /tmp/state.json
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.resources!.length, 2);
  assert.deepEqual(cfg.resources![0]!.watcher, {
    type: "polling",
    interval_ms: 5000,
  });
  assert.deepEqual(cfg.resources![1]!.watcher, {
    type: "file",
    path: "/tmp/state.json",
  });
});

test("config rejects resources that isn't an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  not_an_array: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources must be an array/);
});

test("config rejects a resource missing uri", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - name: Missing URI
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]\.uri is required/);
});

test("config rejects a resource with an invalid uri", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: "not a uri because spaces"
    name: Bad
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]\.uri .* valid URL/);
});

test("config rejects duplicate resource URIs", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://dup
    name: A
    handler: { inline: { text: a } }
  - uri: config://dup
    name: B
    handler: { inline: { text: b } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /duplicate uri "config:\/\/dup"/);
});

test("config rejects a resource with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    bogus: 42
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]: unknown key "bogus"/);
});

test("config rejects a polling watcher missing interval_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /polling watcher .* interval_ms/);
});

test("config rejects a polling watcher with a non-positive interval_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 0
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /interval_ms .* positive number/);
});

test("config rejects a polling watcher with bad change_detection", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 5000
      change_detection: maybe
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /change_detection .* "hash" or "always"/);
});

test("config rejects a file watcher missing path", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: file
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /file watcher .* path/);
});

test("config rejects an unknown watcher type", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: webhook
      url: https://example.com
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /watcher\.type must be one of polling, file/);
});

test("config rejects a watcher with an unknown key for its type", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: polling
      interval_ms: 5000
      path: /tmp/x
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /polling watcher: unknown key "path"/);
});
