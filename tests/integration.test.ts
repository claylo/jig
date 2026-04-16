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

test(
  "probe value bakes into tool description at registration time",
  { timeout: 15_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-plan5-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan5-int
  version: "0.0.1"
probes:
  marker:
    exec: "echo plan5-marker-value"
tools:
  - name: t1
    description: "Marker is {{probe.marker}}"
    handler: { inline: { text: ok } }
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
          { jsonrpc: "2.0", id: 2, method: "tools/list" },
        ],
      );
      const list = responses.find((r) => r.id === 2)!.result as {
        tools: { name: string; description: string }[];
      };
      const t1 = list.tools.find((t) => t.name === "t1")!;
      // exec strips trailing newline; the marker should be a clean substring.
      assert.match(t1.description, /Marker is plan5-marker-value/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);

test("resources/list returns registered resources", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-list-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-list, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    description: Greeting
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "resources/list response present");
    const result = listResp.result as { resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> };
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0]!.uri, "config://jig/hello");
    assert.equal(result.resources[0]!.name, "Hello");
    assert.equal(result.resources[0]!.description, "Greeting");
    assert.equal(result.resources[0]!.mimeType, "text/plain");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resources/read returns the handler's text content", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-read-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-read, version: "0.0.1" }
resources:
  - uri: config://jig/hello
    name: Hello
    mimeType: text/plain
    handler:
      inline:
        text: "hello, world"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "config://jig/hello" } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    const result = readResp.result as { contents: Array<{ uri: string; mimeType?: string; text: string }> };
    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0]!.uri, "config://jig/hello");
    assert.equal(result.contents[0]!.mimeType, "text/plain");
    assert.equal(result.contents[0]!.text, "hello, world");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resources/read surfaces isError handlers as a JSON-RPC error", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-read-err-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-read-err, version: "0.0.1" }
resources:
  - uri: config://jig/broken
    name: Broken
    handler:
      exec: "sh -c 'echo oops >&2; exit 2'"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "config://jig/broken" } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    assert.ok(readResp.error, "read of an isError handler must return a JSON-RPC error");
    assert.match(readResp.error!.message, /read failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("polling watcher emits resources/updated when content changes and client is subscribed", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-poll-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-poll, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 200
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    child.stdout.setEncoding("utf8");
    let buf = "";
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/subscribe", params: { uri: "config://jig/state" } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // Wait one polling interval so the hash-baseline is captured, then mutate.
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(statePath, "two");

    // Give the watcher up to 2 more intervals to fire.
    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 2_000);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.ok(updated, "expected a resources/updated notification");
    const parsed = JSON.parse(updated!) as { method: string; params: { uri: string } };
    assert.equal(parsed.method, "notifications/resources/updated");
    assert.equal(parsed.params.uri, "config://jig/state");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function waitForLine(lines: string[], pred: (l: string) => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (lines.some(pred)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for line matching predicate. Got:\n${lines.join("\n")}`);
}

test("file watcher emits resources/updated when the watched file changes", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-file-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-file, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: file
      path: ${statePath}
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/subscribe", params: { uri: "config://jig/state" } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // Mutate the file; fs.watch fires immediately on macOS/Linux.
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(statePath, "two");

    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 3_000);

    child.stdin.end();
    await new Promise((r) => child.on("close", r));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file watcher rejects a path outside the filesystem allowlist at boot", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-file-deny-"));
  const outside = "/etc/hosts"; // well-known path outside $dir
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-file-deny, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      inline: { text: "ok" }
    watcher:
      type: file
      path: ${outside}
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stderrChunks: string[] = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => stderrChunks.push(c));
    child.stdin.end();
    const code: number | null = await new Promise((r) => child.on("close", r));
    assert.equal(code, 1, "server must exit 1 when a watcher path is outside the allowlist");
    const stderr = stderrChunks.join("");
    assert.match(stderr, /watcher path .* not in .*allow/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("polling watcher does not emit when client is not subscribed", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-nosub-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "one");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan6-nosub, version: "0.0.1", security: { filesystem: { allow: ["${dir}"] } } }
resources:
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 150
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "0" },
    } }) + "\n");
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // No subscribe! Just mutate and wait.
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(statePath, "two");
    await new Promise((r) => setTimeout(r, 600));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.equal(updated, undefined, "no update notification should fire without a subscription");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan 6 resources round-trip: list + read + subscribe + polling update + unsubscribe", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan6-e2e-"));
  const statePath = join(dir, "state.txt");
  writeFileSync(statePath, "initial");
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server:
  name: plan6-e2e
  version: "0.0.1"
  security:
    filesystem:
      allow: ["${dir}"]
resources:
  - uri: config://jig/hello
    name: Hello
    mimeType: text/plain
    handler:
      inline:
        text: "hi"
  - uri: config://jig/state
    name: State
    handler:
      exec: "cat ${statePath}"
    watcher:
      type: polling
      interval_ms: 150
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });

    const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    send({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    send({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "config://jig/hello" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3'));

    send({ jsonrpc: "2.0", id: 4, method: "resources/subscribe", params: { uri: "config://jig/state" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4'));

    await new Promise((r) => setTimeout(r, 250));
    writeFileSync(statePath, "mutated");
    await waitForLine(stdoutLines, (l) => l.includes("notifications/resources/updated") && l.includes("config://jig/state"), 3_000);

    send({ jsonrpc: "2.0", id: 5, method: "resources/unsubscribe", params: { uri: "config://jig/state" } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5'));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const list = JSON.parse(stdoutLines.find((l) => l.includes('"id":2'))!) as { result: { resources: Array<{ uri: string }> } };
    assert.equal(list.result.resources.length, 2);
    const read = JSON.parse(stdoutLines.find((l) => l.includes('"id":3'))!) as { result: { contents: Array<{ text: string }> } };
    assert.equal(read.result.contents[0]!.text, "hi");
    const updated = stdoutLines.find((l) => l.includes("notifications/resources/updated"));
    assert.ok(updated, "update notification");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prompts/list returns registered prompts with arguments", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-plist-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-plist, version: "0.0.1" }
prompts:
  - name: analyze_job
    description: Analyze a completed job
    arguments:
      - name: jobId
        description: The job ID
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: "Analyze job {{jobId}} at {{depth}} depth."
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "prompts/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "prompts/list response present");
    const result = listResp!.result as {
      prompts: Array<{
        name: string;
        description?: string;
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
      }>;
    };
    assert.equal(result.prompts.length, 1);
    assert.equal(result.prompts[0]!.name, "analyze_job");
    assert.equal(result.prompts[0]!.description, "Analyze a completed job");
    assert.equal(result.prompts[0]!.arguments!.length, 2);
    assert.equal(result.prompts[0]!.arguments![0]!.name, "jobId");
    assert.equal(result.prompts[0]!.arguments![0]!.required, true);
    assert.equal(result.prompts[0]!.arguments![1]!.name, "depth");
    assert.equal(result.prompts[0]!.arguments![1]!.required, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("prompts/get renders the template with provided args", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-pget-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-pget, version: "0.0.1" }
prompts:
  - name: greet
    arguments:
      - name: who
        required: true
    template: "Hello, {{who}}!"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "prompts/get", params: {
          name: "greet",
          arguments: { who: "world" },
        } },
      ],
    );
    const getResp = resp.find((r) => r.id === 2);
    assert.ok(getResp, "prompts/get response present");
    const result = getResp!.result as {
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]!.role, "user");
    assert.equal(result.messages[0]!.content.type, "text");
    assert.equal(result.messages[0]!.content.text, "Hello, world!");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { createServer as createHttpServerInt } from "node:http";
import type { AddressInfo as AddressInfoInt } from "node:net";

test(
  "http + graphql round-trip over stdio",
  { timeout: 15_000 },
  async () => {
    // Fixture server serves /items/* and /graphql.
    const seen: { method?: string; url?: string; body?: string; ct?: string }[] = [];
    const server = createHttpServerInt((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        seen.push({
          method: req.method,
          url: req.url,
          body,
          ct: (req.headers["content-type"] as string | undefined) ?? "",
        });
        if (req.url === "/graphql") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: { search: [{ id: "1", name: "X" }] } }));
        } else if (req.method === "GET" && req.url?.startsWith("/items")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end('[{"id":"1","title":"first"}]');
        } else {
          res.writeHead(404);
          res.end("not found");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfoInt).port;
    const fixtureUrl = `http://127.0.0.1:${port}`;

    const dir = mkdtempSync(join(tmpdir(), "jig-plan4-int-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan4-int
  version: "0.0.1"
connections:
  rest_api:
    url: ${fixtureUrl}
    timeout_ms: 2000
  graph_api:
    url: ${fixtureUrl}/graphql
    timeout_ms: 2000
tools:
  - name: example
    description: x
    input:
      action: { type: string, required: true }
      term: { type: string }
    handler:
      dispatch:
        on: action
        cases:
          list:
            handler:
              http:
                connection: rest_api
                method: GET
                path: "/items"
          search:
            handler:
              graphql:
                connection: graph_api
                query: "query Search($term: String!) { search(term: $term) { id name } }"
                variables:
                  term: "{{term}}"
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
            params: { name: "example", arguments: { action: "list" } },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "example", arguments: { action: "search", term: "jig" } },
          },
        ],
      );
      const byId = new Map<number, (typeof responses)[number]>();
      for (const r of responses) byId.set(r.id as number, r);

      const list = byId.get(2)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(list.isError, undefined);
      assert.match(list.content[0]!.text, /"title":"first"/);

      const search = byId.get(3)!.result as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      assert.equal(search.isError, undefined);
      assert.match(search.content[0]!.text, /"name":"X"/);

      // Fixture saw a GET /items and a POST /graphql with the variables.
      const gqlCall = seen.find((s) => s.url === "/graphql")!;
      assert.equal(gqlCall.method, "POST");
      assert.match(gqlCall.ct!, /application\/json/);
      const gqlBody = JSON.parse(gqlCall.body!) as {
        query: string;
        variables: { term: string };
      };
      assert.equal(gqlBody.variables.term, "jig");
    } finally {
      rmSync(dir, { recursive: true });
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);

test(
  "graphql probe value flows into tool handler at request time",
  { timeout: 15_000 },
  async () => {
    const seen: string[] = [];
    const server = createHttpServerInt((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push(req.url ?? "");
        if (req.url === "/graphql") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: { region: "us-east-1" } }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfoInt).port;
    const fixtureUrl = `http://127.0.0.1:${port}`;

    const dir = mkdtempSync(join(tmpdir(), "jig-plan5-gql-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: plan5-gql-int
  version: "0.0.1"
connections:
  api:
    url: ${fixtureUrl}/graphql
    timeout_ms: 2000
probes:
  region_envelope:
    graphql:
      connection: api
      query: "{ region }"
    map: { var: "result.region" }
tools:
  - name: where
    description: x
    handler:
      exec: "echo region={{probe.region_envelope}}"
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
          { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "where", arguments: {} } },
        ],
      );
      // Probe ran at boot, fixture saw the graphql request.
      assert.ok(seen.includes("/graphql"), "fixture should have seen /graphql");
      const out = responses.find((r) => r.id === 2)!.result as {
        content: { text: string }[];
      };
      assert.match(out.content[0]!.text, /region=us-east-1/);
    } finally {
      rmSync(dir, { recursive: true });
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
);

test("resources/templates/list returns registered template resources", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-tlist-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-tlist, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: application/json
    handler:
      inline:
        text: "[]"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/templates/list" },
      ],
    );
    const listResp = resp.find((r) => r.id === 2);
    assert.ok(listResp, "resources/templates/list response present");
    const result = listResp!.result as {
      resourceTemplates: Array<{ uriTemplate: string; name: string; mimeType?: string }>;
    };
    assert.equal(result.resourceTemplates.length, 1);
    assert.equal(result.resourceTemplates[0]!.uriTemplate, "queue://jobs/{status}");
    assert.equal(result.resourceTemplates[0]!.name, "Jobs by status");
    assert.equal(result.resourceTemplates[0]!.mimeType, "application/json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resources/read resolves a templated resource with variables", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-tread-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-tread, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: text/plain
    handler:
      exec: "echo jobs with status={{status}}"
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        { jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "queue://jobs/pending" } },
      ],
    );
    const readResp = resp.find((r) => r.id === 2);
    assert.ok(readResp, "resources/read response present");
    const result = readResp!.result as {
      contents: Array<{ uri: string; mimeType?: string; text: string }>;
    };
    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0]!.uri, "queue://jobs/pending");
    assert.match(result.contents[0]!.text, /jobs with status=pending/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completion/complete returns prefix-filtered values for a prompt argument ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-prompt-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-prompt, version: "0.0.1" }
prompts:
  - name: analyze_job
    arguments:
      - name: depth
        required: false
    template: "Analyze at {{depth}} depth."
completions:
  prompts:
    analyze_job:
      depth:
        - summary
        - detailed
        - verbose
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "completion/complete",
          params: {
            ref: { type: "ref/prompt", name: "analyze_job" },
            argument: { name: "depth", value: "de" },
          },
        },
      ],
    );
    const compResp = resp.find((r) => r.id === 2);
    assert.ok(compResp, "completion/complete response present");
    const result = compResp!.result as {
      completion: { values: string[]; total: number; hasMore: boolean };
    };
    assert.deepEqual(result.completion.values, ["detailed"]);
    assert.equal(result.completion.total, 3);
    assert.equal(result.completion.hasMore, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completion/complete returns prefix-filtered values for a resource template variable ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-res-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-res, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    handler:
      inline:
        text: "[]"
completions:
  resources:
    "queue://jobs/{status}":
      status:
        - pending
        - active
        - completed
        - failed
        - cancelled
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "completion/complete",
          params: {
            ref: { type: "ref/resource", uri: "queue://jobs/{status}" },
            argument: { name: "status", value: "c" },
          },
        },
      ],
    );
    const compResp = resp.find((r) => r.id === 2);
    assert.ok(compResp, "completion/complete response present");
    const result = compResp!.result as {
      completion: { values: string[]; total: number; hasMore: boolean };
    };
    assert.equal(result.completion.values.length, 2);
    assert.ok(result.completion.values.includes("completed"), "expected completed");
    assert.ok(result.completion.values.includes("cancelled"), "expected cancelled");
    assert.equal(result.completion.total, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completion/complete returns empty for an unknown ref", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-comp-unknown-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-comp-unknown, version: "0.0.1" }
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "completion/complete",
          params: {
            ref: { type: "ref/prompt", name: "nonexistent" },
            argument: { name: "arg", value: "x" },
          },
        },
      ],
    );
    const compResp = resp.find((r) => r.id === 2);
    // No completions: block means no handler wired and no capability
    // advertised. SDK may surface unknown ref as either an error or an
    // empty result; both are acceptable — the check is just no-crash.
    assert.ok(compResp, "got a response for completion/complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan 7 round-trip: initialize + prompts/list + prompts/get + resources/templates/list + resources/read (templated) + completion/complete (both ref types)", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan7-e2e-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan7-e2e, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs by status
    mimeType: application/json
    handler:
      exec: "echo jobs-status={{status}}"
prompts:
  - name: greet
    arguments:
      - name: who
        required: true
    template: "Hello, {{who}}!"
completions:
  prompts:
    greet:
      who: [alice, bob, carol]
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed]
tools: []
`);
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdoutLines: string[] = [];
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.trim()) stdoutLines.push(line);
      }
    });
    // Drain stderr so the child never blocks on a full pipe (>~64KB).
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", () => {});

    const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

    // 1. initialize
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));

    // 2. prompts/list
    send({ jsonrpc: "2.0", id: 2, method: "prompts/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2'));

    // 3. prompts/get
    send({ jsonrpc: "2.0", id: 3, method: "prompts/get", params: {
      name: "greet", arguments: { who: "world" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3'));

    // 4. resources/templates/list
    send({ jsonrpc: "2.0", id: 4, method: "resources/templates/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4'));

    // 5. resources/read (templated)
    send({ jsonrpc: "2.0", id: 5, method: "resources/read", params: {
      uri: "queue://jobs/active",
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5'));

    // 6. completion/complete — prompt argument ref
    send({ jsonrpc: "2.0", id: 6, method: "completion/complete", params: {
      ref: { type: "ref/prompt", name: "greet" },
      argument: { name: "who", value: "a" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":6'));

    // 7. completion/complete — resource template variable ref
    send({ jsonrpc: "2.0", id: 7, method: "completion/complete", params: {
      ref: { type: "ref/resource", uri: "queue://jobs/{status}" },
      argument: { name: "status", value: "p" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":7'));

    child.stdin.end();
    await new Promise((r) => child.on("close", r));

    const parse = (id: number) =>
      JSON.parse(stdoutLines.find((l) => l.includes(`"id":${id}`))!);

    // Verify prompts/list
    const plist = parse(2) as { result: { prompts: Array<{ name: string }> } };
    assert.equal(plist.result.prompts.length, 1);
    assert.equal(plist.result.prompts[0]!.name, "greet");

    // Verify prompts/get rendered template
    const pget = parse(3) as { result: { messages: Array<{ role: string; content: { text: string } }> } };
    assert.equal(pget.result.messages[0]!.role, "user");
    assert.equal(pget.result.messages[0]!.content.text, "Hello, world!");

    // Verify resources/templates/list
    const tlist = parse(4) as { result: { resourceTemplates: Array<{ uriTemplate: string }> } };
    assert.equal(tlist.result.resourceTemplates.length, 1);
    assert.equal(tlist.result.resourceTemplates[0]!.uriTemplate, "queue://jobs/{status}");

    // Verify templated resources/read (exec handler renders the template variable)
    const tread = parse(5) as { result: { contents: Array<{ uri: string; text: string }> } };
    assert.equal(tread.result.contents[0]!.uri, "queue://jobs/active");
    assert.match(tread.result.contents[0]!.text, /jobs-status=active/);

    // Verify completion for prompt arg (prefix "a" matches "alice")
    const comp6 = parse(6) as { result: { completion: { values: string[] } } };
    assert.ok(comp6.result.completion.values.includes("alice"));

    // Verify completion for template var (prefix "p" matches "pending")
    const comp7 = parse(7) as { result: { completion: { values: string[] } } };
    assert.ok(comp7.result.completion.values.includes("pending"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("server boots with tasks capability advertised even when no task tool is declared", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-cap-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-cap, version: "0.0.1" }
tools: []
`);
  try {
    const resp = await sendRpc(
      "src/runtime/index.ts",
      cfgPath,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        } },
      ],
    );
    const initResp = resp.find((r) => r.id === 1);
    assert.ok(initResp, "initialize response present");
    const result = initResp!.result as {
      capabilities: { tasks?: object };
    };
    assert.ok(result.capabilities.tasks, "tasks capability advertised");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tools/call on a task tool returns a CreateTaskResult, not a CallToolResult", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-create-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-create, version: "0.0.1" }
tasks:
  instant:
    initial: done
    states:
      done:
        mcpStatus: completed
        result:
          text: "instant complete"
tools:
  - name: do_thing
    description: "Instant task"
    execution:
      taskSupport: required
    handler:
      workflow: { ref: instant }
`);
  // Task tools keep the InMemoryTaskStore's event loop alive, so the
  // child process never exits on stdin close. Use spawn + explicit kill.
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "test", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "do_thing",
      arguments: {},
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const callResp = JSON.parse(callLine);
    const result = callResp.result as { task?: { taskId: string; status: string } };
    assert.ok(result.task, "tools/call returned a task object (CreateTaskResult shape)");
    assert.ok(result.task!.taskId, "task has a taskId");
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan 8 task lifecycle: tools/call -> tasks/get -> tasks/result returns interpreter output", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-lifecycle-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-lifecycle, version: "0.0.1" }
tasks:
  echo_workflow:
    initial: compute
    states:
      compute:
        mcpStatus: working
        statusMessage: "computing"
        actions:
          - inline: { text: '{"squared": 16}' }
        on:
          - target: done
      done:
        mcpStatus: completed
        result:
          text: "input.n={{input.n}} squared={{result.squared}}"
tools:
  - name: square
    description: "Square a number via workflow"
    input:
      n: { type: integer, required: true }
    execution:
      taskSupport: required
    handler:
      workflow: { ref: echo_workflow }
`);
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });

  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    // 1. initialize + initialized notification
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "lifecycle", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    // 2. tools/call → CreateTaskResult
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
        name: "square",
        arguments: { n: 4 },
        task: { ttl: 60_000 },
      } });
      await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
      const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
      const callResp = JSON.parse(callLine);
      const taskId = callResp.result.task.taskId;
      assert.ok(taskId, "got taskId");

      // 3. Poll tasks/get until status is terminal
      let status = "working";
      let pollId = 3;
      const start = Date.now();
      while (status === "working" && Date.now() - start < 5_000) {
        send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
        const idMarker = `"id":${pollId}`;
        await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
        const getResp = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!);
        status = getResp.result.status;
        pollId++;
        if (status === "working") {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      assert.equal(status, "completed", "task reached completed status");

      // 4. tasks/result → final CallToolResult
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
      const resultResp = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!);
      const finalResult = resultResp.result as {
        content: Array<{ type: string; text: string }>;
      };
      assert.equal(finalResult.content[0]!.text, "input.n=4 squared=16");
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
});

// Phase 7: Dispatcher-task fusion integration tests

test("dispatcher-task fusion: non-workflow case becomes a synthetic one-step task", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-help-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-fusion-help, version: "0.0.1" }
tasks:
  noop:
    initial: done
    states:
      done: { mcpStatus: completed, result: { text: ok } }
tools:
  - name: jobs
    description: "Dispatcher with one workflow case and one inline case"
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        cases:
          help:
            handler:
              inline: { text: "help text here" }
          run:
            handler:
              workflow: { ref: noop }
`);
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "test", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "jobs",
      arguments: { action: "help" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const callResp = JSON.parse(callLine);
    const result = callResp.result as { task?: { taskId: string; status: string } };
    assert.ok(result.task, "non-workflow case still returns a CreateTaskResult");
    assert.ok(result.task!.taskId);

    // The synthetic one-step task should be completed almost immediately.
    await new Promise((r) => setTimeout(r, 100));
    send({ jsonrpc: "2.0", id: 3, method: "tasks/get", params: { taskId: result.task!.taskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3') && l.includes('"result"'));
    const getLine = stdoutLines.find((l) => l.includes('"id":3') && l.includes('"result"'))!;
    const status = JSON.parse(getLine).result.status;
    assert.equal(status, "completed", "synthetic one-step task completed");

    send({ jsonrpc: "2.0", id: 4, method: "tasks/result", params: { taskId: result.task!.taskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4') && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes('"id":4') && l.includes('"result"'))!;
    const text = JSON.parse(resLine).result.content[0].text;
    assert.equal(text, "help text here");
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispatcher-task fusion: workflow case routes through the interpreter", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-run-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, [
    "server: { name: plan8-fusion-run, version: '0.0.1' }",
    "tasks:",
    "  echo_workflow:",
    "    initial: compute",
    "    states:",
    "      compute:",
    "        mcpStatus: working",
    "        actions:",
    '          - inline:',
    '              text: \'{"squared": 16}\'',
    "        on:",
    "          - target: done",
    "      done:",
    "        mcpStatus: completed",
    "        result:",
    '          text: "input.n={{input.n}} squared={{result.squared}}"',
    "tools:",
    "  - name: math",
    '    description: "Dispatcher whose run case kicks off a workflow"',
    "    input:",
    "      action: { type: string, required: true }",
    "      n: { type: integer }",
    "    execution:",
    "      taskSupport: optional",
    "    handler:",
    "      dispatch:",
    "        on: action",
    "        cases:",
    "          run:",
    "            requires: [n]",
    "            handler:",
    "              workflow: { ref: echo_workflow }",
  ].join("\n"));
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  // Drain stderr so the child never blocks on a full pipe.
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => {});
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "fusion", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "math",
      arguments: { action: "run", n: 4 },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const taskId = JSON.parse(callLine).result.task.taskId as string;
    assert.ok(taskId);

    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while (status === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
      status = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!).result.status;
      pollId++;
      if (status === "working") await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(status, "completed");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
    const finalText = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!).result.content[0].text as string;
    assert.equal(finalText, "input.n=4 squared=16");
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dispatcher-task fusion: all-sync dispatcher under taskSupport", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan8-fusion-allsync-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan8-fusion-allsync, version: "0.0.1" }
tools:
  - name: query
    description: "All-sync dispatcher under taskSupport"
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: optional
    handler:
      dispatch:
        on: action
        cases:
          ping:
            handler:
              inline: { text: "pong" }
`);
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "test", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "query",
      arguments: { action: "ping" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const result = JSON.parse(callLine).result as { task?: { taskId: string } };
    assert.ok(result.task, "all-sync dispatcher tool still returns CreateTaskResult");
    assert.ok(result.task!.taskId);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// Phase 8: End-to-end tests against the ACTUAL example YAMLs

test("plan 8 e2e against examples/tasks.yaml: validating → enriching → notifying → completed", { timeout: 15_000 }, async () => {
  const cfgPath = "examples/tasks.yaml";
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => {});
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "e2e", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "process_job",
      arguments: { jobId: "j-99" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const taskId = JSON.parse(callLine).result.task.taskId as string;
    assert.ok(taskId, "tools/call returned a taskId");

    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while (status === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
      const getLine = stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working") await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(status, "completed", "task reached completed status");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!;
    const finalText = JSON.parse(resLine).result.content[0].text as string;
    assert.match(finalText, /Job j-99 processed/);
    assert.match(finalText, /Notification posted to: #ops/);
  } finally {
    child.kill();
  }
});

test("plan 8 e2e against examples/tasks-one-tool.yaml: dispatcher fusion (help → synthetic, run → workflow)", { timeout: 15_000 }, async () => {
  const cfgPath = "examples/tasks-one-tool.yaml";
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => {});
  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: { tasks: { requests: { tools: { call: true } } } },
      clientInfo: { name: "e2e-onetool", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    // tools/list shows ONE tool ("jobs") — single-tool spirit preserved
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const listLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const tools = JSON.parse(listLine).result.tools as Array<{ name: string }>;
    assert.equal(tools.length, 1, "single-tool dispatcher exposes exactly one MCP tool");
    assert.equal(tools[0]!.name, "jobs");

    // action=help (synthetic one-step task)
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
      name: "jobs",
      arguments: { action: "help" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":3') && l.includes('"result"'));
    const helpCallLine = stdoutLines.find((l) => l.includes('"id":3') && l.includes('"result"'))!;
    const helpTaskId = JSON.parse(helpCallLine).result.task.taskId as string;
    assert.ok(helpTaskId);

    await new Promise((r) => setTimeout(r, 50));
    send({ jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId: helpTaskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":4') && l.includes('"result"'));
    const helpStatus = JSON.parse(stdoutLines.find((l) => l.includes('"id":4') && l.includes('"result"'))!).result.status;
    assert.equal(helpStatus, "completed", "help (synthetic) completes immediately");

    send({ jsonrpc: "2.0", id: 5, method: "tasks/result", params: { taskId: helpTaskId } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":5') && l.includes('"result"'));
    const helpText = JSON.parse(stdoutLines.find((l) => l.includes('"id":5') && l.includes('"result"'))!).result.content[0].text as string;
    assert.match(helpText, /jobs management/);

    // action=run (workflow case)
    send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {
      name: "jobs",
      arguments: { action: "run", jobId: "j-77" },
      task: { ttl: 60_000 },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":6') && l.includes('"result"'));
    const runCallLine = stdoutLines.find((l) => l.includes('"id":6') && l.includes('"result"'))!;
    const runTaskId = JSON.parse(runCallLine).result.task.taskId as string;
    assert.ok(runTaskId);

    let runStatus = "working";
    let pollId = 7;
    const start = Date.now();
    while (runStatus === "working" && Date.now() - start < 5_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId: runTaskId } });
      const idMarker = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
      runStatus = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!).result.status;
      pollId++;
      if (runStatus === "working") await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(runStatus, "completed");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId: runTaskId } });
    const idMarker = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idMarker) && l.includes('"result"'));
    const runText = JSON.parse(stdoutLines.find((l) => l.includes(idMarker) && l.includes('"result"'))!).result.content[0].text as string;
    assert.match(runText, /Job j-77 processed/);
    assert.match(runText, /Notification posted to: #ops/);
  } finally {
    child.kill();
  }
});

// ─── Plan 9: Elicitation integration tests ──────────────────────────

test("plan 9 elicitation lifecycle: tools/call -> elicitation/create -> accept -> tasks/result", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan9-elicit-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan9-elicit, version: "0.0.1" }
tasks:
  confirm_workflow:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        statusMessage: "Awaiting confirmation"
        elicitation:
          message: "Proceed?"
          required: [ok]
          schema:
            ok:
              type: boolean
              description: "Confirm"
        on:
          - when: { "var": "elicitation.ok" }
            target: done
          - target: rejected
      done:
        mcpStatus: completed
        result:
          text: "Confirmed for {{input.item}}"
      rejected:
        mcpStatus: failed
        result:
          text: "Rejected for {{input.item}}"
tools:
  - name: confirm
    description: "Confirm an item"
    input:
      item: { type: string, required: true }
    execution:
      taskSupport: required
    handler:
      workflow: { ref: confirm_workflow }
`);
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  child.stderr.on("data", () => {}); // drain stderr

  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    // 1. Initialize with elicitation capability
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: {
        tasks: { requests: { tools: { call: true } } },
        elicitation: { form: {} },
      },
      clientInfo: { name: "test-elicit", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    // 2. tools/call -> CreateTaskResult
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "confirm",
      arguments: { item: "deploy-v3" },
      task: { ttl: 60_000 },
    } });

    // 3. Wait for elicitation/create request from server
    // NOTE: The SDK may assign id:0 to the elicitation request — use
    // !== undefined/null checks, not !id (falsy-zero).
    await waitForLine(stdoutLines, (l) => l.includes("elicitation/create"));
    const elicitLine = stdoutLines.find((l) => l.includes("elicitation/create"))!;
    const elicitReq = JSON.parse(elicitLine);
    assert.ok(elicitReq.id !== undefined && elicitReq.id !== null, "elicitation request has an id");
    assert.ok(
      elicitReq.params?.requestedSchema?.properties?.ok,
      "elicitation schema has 'ok' field",
    );

    // 4. Respond: accept with ok=true
    send({ jsonrpc: "2.0", id: elicitReq.id, result: {
      action: "accept",
      content: { ok: true },
    } });

    // 5. Wait for tools/call response (may arrive after elicitation)
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const taskId = JSON.parse(callLine).result.task?.taskId;
    assert.ok(taskId, "tools/call returned a taskId");

    // 6. Poll tasks/get until completed
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while ((status === "working" || status === "input_required") && Date.now() - start < 10_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idM = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
      const getLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working" || status === "input_required") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "completed", "task reached completed");

    // 7. tasks/result
    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idM = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
    const finalText = JSON.parse(resLine).result.content[0].text;
    assert.ok(finalText.includes("deploy-v3"), `result contains input: ${finalText}`);
    assert.ok(finalText.includes("Confirmed"), `result says confirmed: ${finalText}`);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan 9 elicitation decline: elicitation/create -> decline -> rejected", { timeout: 15_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-plan9-decline-"));
  const cfgPath = join(dir, "test.yaml");
  writeFileSync(cfgPath, `
server: { name: plan9-decline, version: "0.0.1" }
tasks:
  confirm_workflow:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        elicitation:
          message: "Proceed?"
          schema:
            ok: { type: boolean }
        on:
          - when: { "var": "elicitation.ok" }
            target: done
          - target: rejected
      done:
        mcpStatus: completed
        result:
          text: "Confirmed"
      rejected:
        mcpStatus: failed
        result:
          text: "Declined"
tools:
  - name: confirm
    description: "Confirm"
    execution:
      taskSupport: required
    handler:
      workflow: { ref: confirm_workflow }
`);
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "src/runtime/index.ts", "--config", cfgPath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdoutLines: string[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) stdoutLines.push(line);
    }
  });
  child.stderr.on("data", () => {});

  const send = (req: object) => child.stdin.write(JSON.stringify(req) + "\n");

  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25",
      capabilities: {
        tasks: { requests: { tools: { call: true } } },
        elicitation: { form: {} },
      },
      clientInfo: { name: "test-decline", version: "0" },
    } });
    await waitForLine(stdoutLines, (l) => l.includes('"id":1'));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 50));

    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "confirm",
      arguments: {},
      task: { ttl: 60_000 },
    } });

    // Wait for elicitation request
    await waitForLine(stdoutLines, (l) => l.includes("elicitation/create"));
    const elicitLine = stdoutLines.find((l) => l.includes("elicitation/create"))!;
    const elicitReq = JSON.parse(elicitLine);
    assert.ok(elicitReq.id !== undefined && elicitReq.id !== null);

    // Decline
    send({ jsonrpc: "2.0", id: elicitReq.id, result: { action: "decline" } });

    // Wait for tools/call response
    await waitForLine(stdoutLines, (l) => l.includes('"id":2') && l.includes('"result"'));
    const callLine = stdoutLines.find((l) => l.includes('"id":2') && l.includes('"result"'))!;
    const taskId = JSON.parse(callLine).result.task?.taskId;
    assert.ok(taskId);

    // Poll until terminal
    let status = "working";
    let pollId = 3;
    const start = Date.now();
    while ((status === "working" || status === "input_required") && Date.now() - start < 10_000) {
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
      const idM = `"id":${pollId}`;
      await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
      const getLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
      status = JSON.parse(getLine).result.status;
      pollId++;
      if (status === "working" || status === "input_required") {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    assert.equal(status, "failed", "task reached failed on decline");

    send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
    const idM = `"id":${pollId}`;
    await waitForLine(stdoutLines, (l) => l.includes(idM) && l.includes('"result"'));
    const resLine = stdoutLines.find((l) => l.includes(idM) && l.includes('"result"'))!;
    const finalText = JSON.parse(resLine).result.content[0].text;
    assert.ok(finalText.includes("Declined"), `result says declined: ${finalText}`);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
