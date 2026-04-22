import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { invokeExec } from "../src/runtime/handlers/exec.ts";
import { invokeDispatch } from "../src/runtime/handlers/dispatch.ts";
import { invokeCompute } from "../src/runtime/handlers/compute.ts";
import { applyTransform } from "../src/runtime/util/transform.ts";
import type { DispatchHandler, Handler, ComputeHandler } from "../src/runtime/config.ts";
import type { ToolCallResult, InvokeContext } from "../src/runtime/handlers/types.ts";
import type { JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";
// Helpers register at module load time inside jsonlogic.ts.
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
import { invokeHttp } from "../src/runtime/handlers/http.ts";
import { invokeGraphql } from "../src/runtime/handlers/graphql.ts";
import { compileConnections } from "../src/runtime/connections.ts";

async function startHandlerFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
) {
  const server = createHttpServer(handler);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Minimal InvokeContext for unit tests that don't need connections or probes. */
const emptyCtx: InvokeContext = { connections: {}, probe: {} };

test("invokeExec returns stdout from /bin/echo as text content", async () => {
  const result = await invokeExec({ exec: ["/bin/echo", "hello"] }, {}, emptyCtx);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.type, "text");
  assert.equal(result.content[0]!.text, "hello\n");
});

test("invokeExec renders Mustache tokens per element", async () => {
  const result = await invokeExec(
    { exec: ["/bin/echo", "{{name}}"] },
    { name: "Alice" },
    emptyCtx,
  );
  assert.equal(result.content[0]!.text, "Alice\n");
});

test("invokeExec flags non-zero exit as isError with stderr", async () => {
  const result = await invokeExec(
    { exec: ["node", "tests/fixtures/exit-nonzero.mjs"] },
    {},
    emptyCtx,
  );
  assert.equal(result.isError, true);
});

test("invokeExec flags missing executable as isError", async () => {
  const result = await invokeExec(
    { exec: ["/does/not/exist"] },
    {},
    emptyCtx,
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /ENOENT|not found|no such file/i);
});

test("invokeExec array form: each element becomes one argv entry", async () => {
  const result = await invokeExec(
    { exec: ["/bin/echo", "hello world"] },
    {},
    emptyCtx,
  );
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "hello world\n");
});

test("invokeExec array form: renders templates per element without splitting", async () => {
  const result = await invokeExec(
    { exec: ["/bin/echo", "{{value}}"] },
    { value: "has spaces in it" },
    emptyCtx,
  );
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "has spaces in it\n");
});

test("invokeExec array form: argument injection via spaces is neutralized", async () => {
  const result = await invokeExec(
    { exec: ["/bin/echo", "{{input}}"] },
    { input: "--flag injected" },
    emptyCtx,
  );
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "--flag injected\n");
});

// Minimal test-local invoke: types against the actual Handler union so
// the stub stays valid when Phase 4 widens the union. Supports inline
// only; Phase 4 replaces this stub call with the real invoke().
async function testInvoke(
  handler: Handler,
  _args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) {
    return { content: [{ type: "text", text: handler.inline.text }] };
  }
  throw new Error("test stub: only inline sub-handlers are exercised in Phase 3");
}

const greetDispatch: DispatchHandler = {
  dispatch: {
    on: "action",
    cases: {
      hello: {
        handler: { inline: { text: "hi" } },
      },
      greet: {
        requires: ["name"],
        handler: { inline: { text: "hi named" } },
      },
    },
  },
};

test("invokeDispatch routes to the matching case handler", async () => {
  const result = await invokeDispatch(greetDispatch, { action: "hello" }, testInvoke, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "hi");
});

test("invokeDispatch returns isError when the discriminator is missing", async () => {
  const result = await invokeDispatch(greetDispatch, {}, testInvoke, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /action.*required/i);
});

test("invokeDispatch returns isError when the action is unknown", async () => {
  const result = await invokeDispatch(
    greetDispatch,
    { action: "bogus" },
    testInvoke,
    {},
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown action.*bogus/i);
  assert.match(result.content[0]!.text, /hello|greet/);
});

test("invokeDispatch enforces per-action requires", async () => {
  const result = await invokeDispatch(
    greetDispatch,
    { action: "greet" },
    testInvoke,
    {},
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /name.*required.*greet/i);
});

test("invokeDispatch passes through args to the sub-handler", async () => {
  let capturedArgs: Record<string, unknown> = {};
  const captureInvoke = async (
    _handler: Handler,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> => {
    capturedArgs = args;
    return { content: [{ type: "text", text: "captured" }] };
  };
  await invokeDispatch(
    greetDispatch,
    { action: "greet", name: "Alice", extra: "preserved" },
    captureInvoke,
    {},
  );
  assert.equal(capturedArgs.action, "greet");
  assert.equal(capturedArgs.name, "Alice");
  assert.equal(capturedArgs.extra, "preserved");
});

test("invokeCompute evaluates a simple var reference", async () => {
  const handler: ComputeHandler = { compute: { var: "name" } };
  const result = await invokeCompute(handler, { name: "Ada" }, emptyCtx);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "Ada");
});

test("invokeCompute evaluates a helper call", async () => {
  const handler: ComputeHandler = { compute: { "os.platform": [] } };
  const result = await invokeCompute(handler, {}, emptyCtx);
  assert.equal(result.isError, undefined);
  assert.equal(typeof result.content[0]!.text, "string");
  assert.ok(result.content[0]!.text.length > 0);
});

test("invokeCompute JSON-stringifies object results", async () => {
  // preserve keeps the object literal from being interpreted as operators.
  const handler: ComputeHandler = {
    compute: { preserve: { a: 1, b: "two" } },
  };
  const result = await invokeCompute(handler, {}, emptyCtx);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, '{"a":1,"b":"two"}');
});

test("invokeCompute stringifies null/undefined as the literal strings", async () => {
  const handler: ComputeHandler = { compute: { var: "missing" } };
  const result = await invokeCompute(handler, {}, emptyCtx);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "null");
});

test("invokeCompute returns isError when the engine throws", async () => {
  // An unknown operator throws at the engine boundary.
  const handler: ComputeHandler = { compute: { unknownOperator: [1, 2] } as unknown as JsonLogicRule };
  const result = await invokeCompute(handler, {}, emptyCtx);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /compute:/i);
});

test("invokeDispatch with when: truthy runs the case handler", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [1, 1] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "went");
});

test("invokeDispatch with when: falsy returns isError naming the action", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [1, 2] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /guard.*go/i);
});

test("invokeDispatch with when: referencing args", async () => {
  const guarded: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          when: { "==": [{ var: "flag" }, true] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const pass = await invokeDispatch(guarded, { action: "go", flag: true }, testInvoke, {});
  assert.equal(pass.isError, undefined);
  const block = await invokeDispatch(guarded, { action: "go", flag: false }, testInvoke, {});
  assert.equal(block.isError, true);
});

test("invokeDispatch with when: AND requires: — both must pass", async () => {
  const both: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          requires: ["id"],
          when: { "==": [{ var: "flag" }, true] },
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  // Both pass
  const ok = await invokeDispatch(
    both,
    { action: "go", id: "x", flag: true },
    testInvoke,
    {},
  );
  assert.equal(ok.isError, undefined);
  // when fails — report guard failure (when is checked before requires)
  const whenFail = await invokeDispatch(
    both,
    { action: "go", id: "x", flag: false },
    testInvoke,
    {},
  );
  assert.equal(whenFail.isError, true);
  assert.match(whenFail.content[0]!.text, /guard/i);
  // when passes, requires fails
  const requiresFail = await invokeDispatch(
    both,
    { action: "go", flag: true },
    testInvoke,
    {},
  );
  assert.equal(requiresFail.isError, true);
  assert.match(requiresFail.content[0]!.text, /id.*required.*go/i);
});

test("invokeDispatch with when: engine error returns isError", async () => {
  const broken: DispatchHandler = {
    dispatch: {
      on: "action",
      cases: {
        go: {
          // Unknown operator — engine throws at evaluate time.
          when: { unknownOperator: [1, 2] } as unknown as import("../src/runtime/util/jsonlogic.ts").JsonLogicRule,
          handler: { inline: { text: "went" } },
        },
      },
    },
  };
  const result = await invokeDispatch(broken, { action: "go" }, testInvoke, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /guard.*go/i);
});

test("applyTransform reshapes handler text using {result, args}", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "raw" }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    { who: "Ada" } as Record<string, unknown>,
    {},
    { cat: [{ var: "result" }, " / greeting for ", { var: "args.who" }] },
  );
  assert.equal(reshaped.isError, undefined);
  assert.equal(reshaped.content[0]!.text, "raw / greeting for Ada");
});

test("applyTransform parses JSON result before reshaping when possible", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: '{"n":41}' }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    {},
    { "+": [{ var: "result.n" }, 1] },
  );
  assert.equal(reshaped.isError, undefined);
  assert.equal(reshaped.content[0]!.text, "42");
});

test("applyTransform passes isError results through without reshaping", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "exec: ENOENT" }],
    isError: true,
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    {},
    { cat: ["should not be applied"] },
  );
  assert.equal(reshaped.isError, true);
  assert.equal(reshaped.content[0]!.text, "exec: ENOENT");
});

test("applyTransform returns isError when the engine throws", async () => {
  const handlerResult: ToolCallResult = {
    content: [{ type: "text", text: "ok" }],
  };
  const reshaped = await applyTransform(
    handlerResult,
    {},
    {},
    { unknownOperator: [] } as unknown as import("../src/runtime/util/jsonlogic.ts").JsonLogicRule,
  );
  assert.equal(reshaped.isError, true);
  assert.match(reshaped.content[0]!.text, /transform:/i);
});

test("invokeHttp GETs the composed URL and returns body", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenUrl = "";
  const fix = await startHandlerFixture((req, res) => {
    seenUrl = req.url ?? "";
    res.writeHead(200);
    res.end("body-ok");
  });
  try {
    const compiled = compileConnections({
      api: { url: fix.url },
    });
    const result = await invokeHttp(
      {
        http: { connection: "api", method: "GET", path: "/{{slug}}" },
      },
      { slug: "hello" },
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, undefined);
    assert.equal(seenUrl, "/hello");
    assert.equal(result.content[0]!.text, "body-ok");
  } finally {
    await fix.close();
  }
});

test("invokeHttp merges connection + handler headers, handler wins on conflict", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenHeaders: Record<string, string | string[] | undefined> = {};
  const fix = await startHandlerFixture((req, res) => {
    seenHeaders = req.headers;
    res.writeHead(200);
    res.end("");
  });
  try {
    const compiled = compileConnections({
      api: {
        url: fix.url,
        headers: {
          "X-Connection": "conn-value",
          "X-Conflict": "conn-wins?",
        },
      },
    });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "GET",
          headers: { "X-Conflict": "handler-wins", "X-Handler": "h-{{id}}" },
        },
      },
      { id: "42" },
      { connections: compiled, probe: {} },
    );
    assert.equal(seenHeaders["x-connection"], "conn-value");
    assert.equal(seenHeaders["x-conflict"], "handler-wins");
    assert.equal(seenHeaders["x-handler"], "h-42");
  } finally {
    await fix.close();
  }
});

test("invokeHttp serializes a body mapping as JSON with Content-Type", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenBody = "";
  let seenCT = "";
  const fix = await startHandlerFixture((req, res) => {
    seenCT = (req.headers["content-type"] as string | undefined) ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(201);
      res.end("{}");
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "POST",
          path: "/items",
          body: { title: "{{title}}", tags: ["{{tag}}", "static"] },
        },
      },
      { title: "hello", tag: "triage" },
      { connections: compiled, probe: {} },
    );
    assert.match(seenCT, /application\/json/);
    const parsed = JSON.parse(seenBody) as { title: string; tags: string[] };
    assert.equal(parsed.title, "hello");
    assert.deepEqual(parsed.tags, ["triage", "static"]);
  } finally {
    await fix.close();
  }
});

test("invokeHttp sends a raw body when body is a string", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenBody = "";
  const fix = await startHandlerFixture((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200);
      res.end("");
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "POST",
          body: "key={{key}}&val={{val}}",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      },
      { key: "k", val: "v" },
      { connections: compiled, probe: {} },
    );
    assert.equal(seenBody, "key=k&val=v");
  } finally {
    await fix.close();
  }
});

test("invokeHttp URL-encodes query params against args", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenUrl = "";
  const fix = await startHandlerFixture((req, res) => {
    seenUrl = req.url ?? "";
    res.writeHead(200);
    res.end("");
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    await invokeHttp(
      {
        http: {
          connection: "api",
          method: "GET",
          path: "/search",
          query: { q: "{{term}}", per_page: "30" },
        },
      },
      { term: "hello world" },
      { connections: compiled, probe: {} },
    );
    assert.match(seenUrl, /\/search\?/);
    assert.match(seenUrl, /q=hello(\+|%20)world/);
    assert.match(seenUrl, /per_page=30/);
  } finally {
    await fix.close();
  }
});

test("invokeHttp denies an unknown connection name", async () => {
  const result = await invokeHttp(
    { http: { connection: "missing", method: "GET" } },
    {},
    emptyCtx,
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown connection "missing"/);
});

test("invokeHttp returns envelope when response: envelope", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(418, { "X-Trace": "t" });
    res.end("short and stout");
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeHttp(
      {
        http: { connection: "api", method: "GET", response: "envelope" },
      },
      {},
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, undefined);
    const env = JSON.parse(result.content[0]!.text) as {
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    assert.equal(env.status, 418);
    assert.equal(env.body, "short and stout");
    assert.equal(env.headers["x-trace"], "t");
  } finally {
    await fix.close();
  }
});

test("invokeHttp uses handler url directly when no connection", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenUrl = "";
  const fix = await startHandlerFixture((req, res) => {
    seenUrl = req.url ?? "";
    res.writeHead(200);
    res.end("direct");
  });
  try {
    const result = await invokeHttp(
      { http: { url: fix.url + "/direct", method: "GET" } },
      {},
      emptyCtx,
    );
    assert.equal(result.isError, undefined);
    assert.equal(seenUrl, "/direct");
    assert.equal(result.content[0]!.text, "direct");
  } finally {
    await fix.close();
  }
});

test("invokeGraphql posts query + variables as JSON to the connection URL", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenCT = "";
  let seenBody = "";
  const fix = await startHandlerFixture((req, res) => {
    seenCT = (req.headers["content-type"] as string | undefined) ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seenBody = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { team: { name: "Engineering" } } }));
    });
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      {
        graphql: {
          connection: "api",
          query: "query GetTeam($id: ID!) { team(id: $id) { name } }",
          variables: { id: "{{team_id}}" },
        },
      },
      { team_id: "t-1" },
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, undefined);
    assert.match(seenCT, /application\/json/);
    const parsed = JSON.parse(seenBody) as { query: string; variables: { id: string } };
    assert.match(parsed.query, /GetTeam/);
    assert.equal(parsed.variables.id, "t-1");
    // Default response: data mode extracts data.
    const data = JSON.parse(result.content[0]!.text) as { team: { name: string } };
    assert.equal(data.team.name, "Engineering");
  } finally {
    await fix.close();
  }
});

test("invokeGraphql flips isError when the response includes errors:", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      errors: [
        { message: "Field \"bogus\" is not defined" },
        { message: "secondary" },
      ],
    }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      { graphql: { connection: "api", query: "{ bogus }" } },
      {},
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /bogus.*not defined/);
  } finally {
    await fix.close();
  }
});

test("invokeGraphql envelope mode returns data + errors + extensions", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startHandlerFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: { partial: true },
      errors: [{ message: "partial failure" }],
      extensions: { trace: "abc" },
    }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await invokeGraphql(
      { graphql: { connection: "api", query: "{ partial }", response: "envelope" } },
      {},
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, undefined);
    const env = JSON.parse(result.content[0]!.text) as {
      data: unknown;
      errors: { message: string }[];
      extensions: unknown;
    };
    assert.deepEqual(env.data, { partial: true });
    assert.equal(env.errors[0]!.message, "partial failure");
    assert.deepEqual(env.extensions, { trace: "abc" });
  } finally {
    await fix.close();
  }
});

test("invokeGraphql denies an unknown connection name", async () => {
  const result = await invokeGraphql(
    { graphql: { connection: "missing", query: "{ x }" } },
    {},
    { connections: compileConnections({}), probe: {} },
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /unknown connection "missing"/);
});

test("invokeGraphql respects connection Content-Type regardless of casing", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seenCT = "";
  const fix = await startHandlerFixture((req, res) => {
    seenCT = (req.headers["content-type"] as string | undefined) ?? "";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { ok: true } }));
  });
  try {
    const compiled = compileConnections({
      api: {
        url: fix.url,
        headers: { "content-Type": "application/graphql" },
      },
    });
    const result = await invokeGraphql(
      { graphql: { connection: "api", query: "{ ok }" } },
      {},
      { connections: compiled, probe: {} },
    );
    assert.equal(result.isError, undefined);
    // Author's casing wins; jig must not also append its own application/json.
    assert.equal(seenCT, "application/graphql");
  } finally {
    await fix.close();
  }
});

test("probe context flows into exec handler render", async () => {
  const ctx: InvokeContext = { connections: {}, probe: { greeting: "world" } };
  const result = await invokeExec(
    { exec: ["/bin/echo", "{{probe.greeting}}"] },
    {},
    ctx,
  );
  assert.equal(result.isError, undefined);
  assert.match(result.content[0]!.text, /world/);
});

test("probe context flows into compute handler", async () => {
  const ctx: InvokeContext = { connections: {}, probe: { region: "us-east-1" } };
  const result = await invokeCompute(
    { compute: { var: "probe.region" } },
    {},
    ctx,
  );
  // compute passes strings through verbatim (no JSON-encoding for plain strings)
  assert.equal(result.content[0]!.text, "us-east-1");
});

test("probe context flows into transform", async () => {
  const raw: ToolCallResult = { content: [{ type: "text", text: "tool result" }] };
  const out = await applyTransform(
    raw,
    {},
    { region: "us-east-1" },
    { cat: ["[", { var: "probe.region" }, "] ", { var: "result" }] },
  );
  assert.equal(out.content[0]!.text, "[us-east-1] tool result");
});
