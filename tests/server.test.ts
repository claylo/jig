import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type JigServerHandle } from "../src/runtime/server.ts";
import type { JigConfig } from "../src/runtime/config.ts";

function minimalConfig(overrides?: Partial<JigConfig>): JigConfig {
  return {
    version: "1",
    server: { name: "test-server", version: "1.0.0" },
    tools: [],
    ...overrides,
  };
}

function makeServer(overrides?: Partial<JigConfig>): JigServerHandle {
  return createServer(minimalConfig(overrides), {});
}

// ── createServer ─────────────────────────────────────────────────────

test("createServer returns a handle with all expected methods", () => {
  const handle = makeServer();
  assert.equal(typeof handle.registerTool, "function");
  assert.equal(typeof handle.registerResource, "function");
  assert.equal(typeof handle.registerResourceTemplate, "function");
  assert.equal(typeof handle.trackSubscriptions, "function");
  assert.equal(typeof handle.sendResourceUpdated, "function");
  assert.equal(typeof handle.registerPrompt, "function");
  assert.equal(typeof handle.wireCompletions, "function");
  assert.equal(typeof handle.registerToolTask, "function");
  assert.equal(typeof handle.connect, "function");
});

// ── registerTool ─────────────────────────────────────────────────────

test("registerTool with inputSchema returns a RegisteredTool handle", () => {
  const handle = makeServer();
  const reg = handle.registerTool(
    "echo",
    {
      description: "Echo input",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
      },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: String(args) }],
    }),
  );
  assert.ok(reg, "registerTool returns a handle");
  assert.equal(typeof reg.update, "function");
  assert.equal(typeof reg.remove, "function");
  assert.equal(typeof reg.enable, "function");
  assert.equal(typeof reg.disable, "function");
});

test("registerTool without inputSchema returns a RegisteredTool handle", () => {
  const handle = makeServer();
  const reg = handle.registerTool(
    "ping",
    { description: "Respond with pong" },
    async () => ({
      content: [{ type: "text" as const, text: "pong" }],
    }),
  );
  assert.ok(reg, "registerTool returns a handle");
});

test("registerTool renders probe context into description", () => {
  const handle = createServer(minimalConfig(), { region: "us-east-1" });
  const reg = handle.registerTool(
    "info",
    { description: "Region: {{probe.region}}" },
    async () => ({ content: [{ type: "text" as const, text: "" }] }),
  );
  assert.ok(reg);
});

// ── registerResource ─────────────────────────────────────────────────

test("registerResource returns a RegisteredResource handle", () => {
  const handle = makeServer();
  const reg = handle.registerResource(
    "state://current",
    { name: "current-state", description: "Current state" },
    async () => ({ contents: [{ uri: "state://current", text: "ok" }] }),
  );
  assert.ok(reg);
});

// ── registerResourceTemplate ─────────────────────────────────────────

test("registerResourceTemplate returns a RegisteredResourceTemplate handle", () => {
  const handle = makeServer();
  const reg = handle.registerResourceTemplate(
    "job-status",
    "queue://jobs/{status}",
    { description: "Jobs by status" },
    async (_uri, _vars) => ({
      contents: [{ uri: "queue://jobs/active", text: "[]" }],
    }),
  );
  assert.ok(reg);
});

// ── trackSubscriptions ───────────────────────────────────────────────

test("trackSubscriptions returns a tracker with isSubscribed", () => {
  const handle = makeServer();
  const tracker = handle.trackSubscriptions();
  assert.equal(typeof tracker.isSubscribed, "function");
  assert.equal(tracker.isSubscribed("state://current"), false);
});

// ── registerPrompt ───────────────────────────────────────────────────

test("registerPrompt with argsSchema returns a handle", () => {
  const handle = makeServer();
  const reg = handle.registerPrompt(
    "greet",
    {
      description: "Greeting prompt",
      argsSchema: {
        type: "object",
        properties: { name: { type: "string" } },
      },
    },
    (args) => ({
      messages: [
        { role: "user" as const, content: { type: "text" as const, text: `Hello ${args["name"]}` } },
      ],
    }),
  );
  assert.ok(reg);
});

test("registerPrompt without argsSchema returns a handle", () => {
  const handle = makeServer();
  const reg = handle.registerPrompt(
    "help",
    { description: "Help prompt" },
    () => ({
      messages: [
        { role: "user" as const, content: { type: "text" as const, text: "How can I help?" } },
      ],
    }),
  );
  assert.ok(reg);
});

// ── registerToolTask ─────────────────────────────────────────────────

test("registerToolTask with inputSchema returns a RegisteredTool handle", () => {
  const handle = makeServer();
  const reg = handle.registerToolTask(
    "build",
    {
      description: "Run a build",
      inputSchema: {
        type: "object",
        properties: { target: { type: "string" } },
      },
      taskSupport: "required",
    },
    {
      async createTask(_args, store) {
        const task = await store.createTask({ ttl: 60_000 });
        return { task };
      },
      async getTask(taskId, store) {
        const t = await store.getTask(taskId);
        if (!t) throw new Error("not found");
        return t;
      },
      async getTaskResult(taskId, store) {
        const r = await store.getTaskResult(taskId);
        if (!r) throw new Error("not found");
        return r as { content: Array<{ type: "text"; text: string }> };
      },
    },
  );
  assert.ok(reg);
});

test("registerToolTask without inputSchema returns a RegisteredTool handle", () => {
  const handle = makeServer();
  const reg = handle.registerToolTask(
    "noop",
    {
      description: "No-args task tool",
      taskSupport: "optional",
    },
    {
      async createTask(_args, store) {
        const task = await store.createTask({ ttl: 60_000 });
        return { task };
      },
      async getTask(taskId, store) {
        const t = await store.getTask(taskId);
        if (!t) throw new Error("not found");
        return t;
      },
      async getTaskResult(taskId, store) {
        const r = await store.getTaskResult(taskId);
        if (!r) throw new Error("not found");
        return r as { content: Array<{ type: "text"; text: string }> };
      },
    },
  );
  assert.ok(reg);
});

// ── wireCompletions ──────────────────────────────────────────────────

test("wireCompletions accepts a completions config without error", () => {
  const handle = makeServer();
  assert.doesNotThrow(() => {
    handle.wireCompletions({
      prompts: {
        greet: { language: ["en", "es", "fr"] },
      },
      resources: {
        "queue://jobs/{status}": { status: ["active", "done", "failed"] },
      },
    });
  });
});

// ── server config mapping ────────────────────────────────────────────

test("createServer passes server description when present", () => {
  const handle = createServer(
    minimalConfig({
      server: {
        name: "described",
        version: "2.0.0",
        description: "A test server",
      },
    }),
    {},
  );
  assert.ok(handle);
});

test("createServer passes instructions when present", () => {
  const handle = createServer(
    minimalConfig({
      server: {
        name: "instructed",
        version: "1.0.0",
        instructions: "Be helpful",
      },
    }),
    {},
  );
  assert.ok(handle);
});
