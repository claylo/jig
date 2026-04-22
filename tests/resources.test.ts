import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { parseConfig } from "../src/runtime/config.ts";
import { startWatchers } from "../src/runtime/resources.ts";
import type { JigServerHandle, SubscriptionTracker } from "../src/runtime/server.ts";

test("config accepts a resources: block with a single static-uri resource", () => {
  const yamlText = `
version: "1"
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
version: "1"
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
    handler: { exec: ["cat", "/tmp/state.json"] }
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
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  not_an_array: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources must be an array/);
});

test("config rejects a resource missing uri", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - name: Missing URI
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /resources\[0\]: exactly one of uri or template/);
});

test("config rejects a resource with an invalid uri", () => {
  const yamlText = `
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: kafka
      topic: events
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /watcher\.type must be one of polling, file, webhook/);
});

test("config accepts a webhook watcher", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: webhook
      port: 9090
tools: []
`;
  const cfg = parseConfig(yamlText);
  const watcher = (cfg.resources![0] as { watcher?: { type: string } }).watcher;
  assert.equal(watcher?.type, "webhook");
});

test("config rejects a webhook watcher without port", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://x
    name: X
    handler: { inline: { text: x } }
    watcher:
      type: webhook
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /webhook watcher requires port/);
});

test("config rejects a watcher with an unknown key for its type", () => {
  const yamlText = `
version: "1"
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

test("config accepts a resources: entry with template: instead of uri:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: application/json
    handler:
      inline:
        text: "[]"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.resources, "resources must be present");
  assert.equal(cfg.resources.length, 1);
  const r = cfg.resources[0]!;
  assert.equal(r.template, "queue://jobs/{status}");
  assert.equal(r.name, "Jobs by status");
  assert.equal(r.mimeType, "application/json");
  assert.ok(!("uri" in r) || r.uri === undefined);
});

test("config rejects a resource with both uri: and template:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: "queue://jobs"
    template: "queue://jobs/{status}"
    name: Bad
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /exactly one of uri or template/);
});

test("config rejects a resource with neither uri: nor template:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - name: Missing both
    handler: { inline: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /exactly one of uri or template/);
});

test("config rejects a template: resource with a watcher:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs
    handler: { inline: { text: "[]" } }
    watcher:
      type: polling
      interval_ms: 5000
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /template.*watcher/i);
});

test("config allows mixed static and template resources", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: "config://jig/hello"
    name: Hello
    handler: { inline: { text: "hi" } }
  - template: "queue://jobs/{status}"
    name: Jobs by status
    handler: { inline: { text: "[]" } }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.resources!.length, 2);
  assert.equal(cfg.resources![0]!.uri, "config://jig/hello");
  assert.equal(cfg.resources![1]!.template, "queue://jobs/{status}");
});

// ─── Webhook watcher behavioral tests ────────────────────────────────

function makeWebhookConfig(port: number, path?: string) {
  const watcherYaml = path
    ? `{ type: webhook, port: ${port}, path: "${path}" }`
    : `{ type: webhook, port: ${port} }`;
  return parseConfig(`
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - uri: config://hook-test
    name: Hook
    handler: { inline: { text: x } }
    watcher: ${watcherYaml}
tools: []
`);
}

function getWebhookPort(): number {
  return 49400 + Math.floor(Math.random() * 500);
}

function postWebhook(port: number, path: string, headers?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path, method: "POST", headers },
      (res) => resolve(res.statusCode ?? 0),
    );
    req.on("error", reject);
    req.end();
  });
}

test("webhook watcher: POST triggers 204 and emits resource update", { timeout: 5_000 }, async () => {
  const port = getWebhookPort();
  const cfg = makeWebhookConfig(port);
  const updates: string[] = [];
  const server: JigServerHandle = {
    registerTool: () => { throw new Error("unused"); },
    registerResource: () => { throw new Error("unused"); },
    sendResourceUpdated: async (uri: string) => { updates.push(uri); },
    connect: async () => {},
    wireCompletions: () => {},
  } as unknown as JigServerHandle;
  const tracker: SubscriptionTracker = {
    isSubscribed: () => true,
  };

  const disposers = startWatchers(cfg.resources!, server, tracker, { connections: {}, probe: {} });
  try {
    await new Promise((r) => setTimeout(r, 100));
    const status = await postWebhook(port, "/webhook");
    assert.equal(status, 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(updates.includes("config://hook-test"), "resource update should have fired");
  } finally {
    for (const d of disposers) d();
  }
});

test("webhook watcher: GET returns 404", { timeout: 5_000 }, async () => {
  const port = getWebhookPort();
  const cfg = makeWebhookConfig(port);
  const server = { sendResourceUpdated: async () => {} } as unknown as JigServerHandle;
  const tracker: SubscriptionTracker = { isSubscribed: () => true };

  const disposers = startWatchers(cfg.resources!, server, tracker, { connections: {}, probe: {} });
  try {
    await new Promise((r) => setTimeout(r, 100));
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { hostname: "127.0.0.1", port, path: "/webhook", method: "GET" },
        (res) => resolve(res.statusCode ?? 0),
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 404);
  } finally {
    for (const d of disposers) d();
  }
});

test("webhook watcher: rejects requests with invalid Host header", { timeout: 5_000 }, async () => {
  const port = getWebhookPort();
  const cfg = makeWebhookConfig(port);
  const server = { sendResourceUpdated: async () => {} } as unknown as JigServerHandle;
  const tracker: SubscriptionTracker = { isSubscribed: () => true };

  const disposers = startWatchers(cfg.resources!, server, tracker, { connections: {}, probe: {} });
  try {
    await new Promise((r) => setTimeout(r, 100));
    const status = await postWebhook(port, "/webhook", { Host: "evil.com" });
    assert.equal(status, 403);
  } finally {
    for (const d of disposers) d();
  }
});
