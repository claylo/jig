import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNTIME_PATH = join(import.meta.dirname!, "..", "src", "runtime", "index.ts");

const MINIMAL_CONFIG = `version: "1"
server: { name: http-test, version: "0.0.1" }
tools:
  - name: ping
    description: Respond with pong
    handler:
      inline:
        text: "pong"
`;

interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

function startServer(
  configPath: string,
  port: number,
): { child: ChildProcess; ready: Promise<void> } {
  const child = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      RUNTIME_PATH,
      "--config",
      configPath,
      "--port",
      String(port),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  child.stderr.setEncoding("utf8");
  child.stdout.setEncoding("utf8");

  const ready = new Promise<void>((resolve, reject) => {
    let stderr = "";
    child.stderr!.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.includes("serving MCP over HTTP")) resolve();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      reject(new Error(`server exited (code ${code}) before ready. stderr: ${stderr}`));
    });
  });

  return { child, ready };
}

class McpHttpClient {
  private port: number;
  private sessionId: string | undefined;

  constructor(port: number) {
    this.port = port;
  }

  async send(request: object): Promise<RpcResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const res = await fetch(`http://127.0.0.1:${this.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      const last = lines[lines.length - 1];
      if (!last) {
        throw new Error(`SSE response had no data lines. Full body:\n${text}`);
      }
      return JSON.parse(last.slice(6)) as RpcResponse;
    }

    const text = await res.text();
    try {
      return JSON.parse(text) as RpcResponse;
    } catch {
      throw new Error(
        `Non-JSON response (${res.status} ${contentType}):\n${text}`,
      );
    }
  }

  async sendNotification(notification: object): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }
    await fetch(`http://127.0.0.1:${this.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(notification),
    });
  }
}

function getFreePort(): number {
  // Use a port in the ephemeral range unlikely to collide. Tests run
  // sequentially within a file, so a simple counter suffices.
  return 49200 + Math.floor(Math.random() * 1000);
}

const INIT_PARAMS = {
  protocolVersion: "2025-11-05",
  capabilities: {},
  clientInfo: { name: "test-client", version: "0.0.1" },
};

function setupTest(): {
  dir: string;
  configPath: string;
  port: number;
  cleanup: (child: ChildProcess) => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "jig-http-"));
  const configPath = join(dir, "jig.yaml");
  writeFileSync(configPath, MINIMAL_CONFIG);
  const port = getFreePort();
  return {
    dir,
    configPath,
    port,
    cleanup(child: ChildProcess) {
      child.kill("SIGTERM");
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function initSession(client: McpHttpClient): Promise<RpcResponse> {
  const res = await client.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: INIT_PARAMS,
  });
  await client.sendNotification({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  return res;
}

test("HTTP transport: initialize handshake", { timeout: 15_000 }, async () => {
  const { configPath, port, cleanup } = setupTest();
  const { child, ready } = startServer(configPath, port);
  const client = new McpHttpClient(port);

  try {
    await ready;
    const initRes = await client.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: INIT_PARAMS,
    });
    assert.equal(initRes.id, 1);
    assert.ok(initRes.result, "expected result in initialize response");
    const result = initRes.result as Record<string, unknown>;
    assert.equal(
      (result.serverInfo as Record<string, unknown>).name,
      "http-test",
    );
  } finally {
    cleanup(child);
  }
});

test("HTTP transport: tools/list after initialize", { timeout: 15_000 }, async () => {
  const { configPath, port, cleanup } = setupTest();
  const { child, ready } = startServer(configPath, port);
  const client = new McpHttpClient(port);

  try {
    await ready;
    await initSession(client);

    const listRes = await client.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    assert.equal(listRes.id, 2);
    const result = listRes.result as { tools: Array<{ name: string }> };
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0]!.name, "ping");
  } finally {
    cleanup(child);
  }
});

test("HTTP transport: tools/call returns inline result", { timeout: 15_000 }, async () => {
  const { configPath, port, cleanup } = setupTest();
  const { child, ready } = startServer(configPath, port);
  const client = new McpHttpClient(port);

  try {
    await ready;
    await initSession(client);

    const callRes = await client.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "ping", arguments: {} },
    });
    assert.equal(callRes.id, 3);
    const result = callRes.result as {
      content: Array<{ type: string; text: string }>;
    };
    assert.equal(result.content[0]!.text, "pong");
  } finally {
    cleanup(child);
  }
});

test("HTTP transport: 404 on non-MCP path", { timeout: 15_000 }, async () => {
  const { configPath, port, cleanup } = setupTest();
  const { child, ready } = startServer(configPath, port);

  try {
    await ready;
    const res = await fetch(`http://127.0.0.1:${port}/not-mcp`);
    assert.equal(res.status, 404);
  } finally {
    cleanup(child);
  }
});
