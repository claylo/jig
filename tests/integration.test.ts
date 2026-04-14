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

test("dispatcher tools/call routes through exec with field-named errors", { timeout: 10_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-int-"));
  const configPath = join(dir, "jig.yaml");
  writeFileSync(
    configPath,
    `server: { name: dispatch-int, version: "0.0.1" }
tools:
  - name: echo
    description: Echo a message
    input:
      action: { type: string, required: true }
      message: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          say:
            requires: [message]
            handler:
              exec: "/bin/echo {{message}}"
          silent:
            handler:
              inline: { text: "" }
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
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "echo", arguments: { action: "say", message: "hello" } },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "echo", arguments: { action: "say" } },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/list",
          params: {},
        },
      ],
    );
    assert.equal(responses.length, 4);

    // Async handlers (exec) resolve out of request order. Match by id.
    const byId = new Map(responses.map((r) => [r.id, r]));

    const ok = byId.get(2)!.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    assert.equal(ok.isError, undefined);
    assert.equal(ok.content[0]!.text.trim(), "hello");

    const bad = byId.get(3)!.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    assert.equal(bad.isError, true);
    assert.match(bad.content[0]!.text, /message.*required.*say/i);

    const list = byId.get(4)!.result as {
      tools: Array<{ inputSchema?: { properties?: Record<string, { enum?: string[] }> } }>;
    };
    const actionProp = list.tools[0]!.inputSchema!.properties!.action!;
    assert.deepEqual(actionProp.enum, ["say", "silent"]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test(
  "compute + when guards + transform round-trip over stdio",
  { timeout: 10_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-plan3-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server: { name: plan3-int, version: "0.0.1" }
tools:
  - name: envcheck
    description: x
    input:
      action: { type: string, required: true }
    handler:
      dispatch:
        on: action
        cases:
          platform:
            handler:
              compute: { "os.platform": [] }
          macos_only:
            when: { "==": [{ "os.platform": [] }, "\${process.platform}"] }
            handler:
              inline: { text: "gated pass" }
          never_match:
            when: { "==": [1, 2] }
            handler:
              inline: { text: "should not run" }
    transform:
      cat: ["wrap(", { var: "result" }, ")"]
`.replace("${process.platform}", process.platform),
    );
    try {
      // Match responses by id: async handlers can complete out of
      // request order over stdio (landmine from Plan 2 handoff).
      const rpcResponses = await sendRpc(
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
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "envcheck", arguments: { action: "platform" } },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "envcheck", arguments: { action: "macos_only" } },
          },
          {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "envcheck", arguments: { action: "never_match" } },
          },
        ],
      );

      const byId = new Map<number, (typeof rpcResponses)[number]>();
      for (const r of rpcResponses) byId.set(r.id as number, r);

      const platform = byId.get(2)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(platform.isError, undefined);
      assert.match(platform.content[0]!.text, /^wrap\(.+\)$/);

      const gated = byId.get(3)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(gated.isError, undefined);
      assert.match(gated.content[0]!.text, /wrap\(gated pass\)/);

      const blocked = byId.get(4)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(blocked.isError, true);
      assert.match(blocked.content[0]!.text, /guard.*never_match/i);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);

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
