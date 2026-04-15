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
