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

test("tools/list and tools/call round-trip for an inline tool", { timeout: 10_000 }, async () => {
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

test("initialize returns serverInfo matching config", { timeout: 10_000 }, async () => {
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
