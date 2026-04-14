import { test } from "node:test";
import assert from "node:assert/strict";
import { invokeExec } from "../src/runtime/handlers/exec.ts";
import { invokeDispatch } from "../src/runtime/handlers/dispatch.ts";
import { invokeCompute } from "../src/runtime/handlers/compute.ts";
import type { DispatchHandler, Handler, ComputeHandler } from "../src/runtime/config.ts";
import type { ToolCallResult } from "../src/runtime/handlers/types.ts";
import type { JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";
// Side-effect: ensures helpers are registered before the compute tests run.
import "../src/runtime/util/helpers.ts";

test("invokeExec returns stdout from /bin/echo as text content", async () => {
  const result = await invokeExec({ exec: "/bin/echo hello" }, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.type, "text");
  assert.equal(result.content[0]!.text, "hello\n");
});

test("invokeExec renders Mustache tokens from args before splitting", async () => {
  const result = await invokeExec(
    { exec: "/bin/echo {{name}}" },
    { name: "Alice" },
  );
  assert.equal(result.content[0]!.text, "Alice\n");
});

test("invokeExec flags non-zero exit as isError with stderr", async () => {
  const result = await invokeExec(
    { exec: "node tests/fixtures/exit-nonzero.mjs" },
    {},
  );
  assert.equal(result.isError, true);
});

test("invokeExec flags missing executable as isError", async () => {
  const result = await invokeExec(
    { exec: "/does/not/exist" },
    {},
  );
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /ENOENT|not found|no such file/i);
});

test("invokeExec rejects empty command after render as isError", async () => {
  const result = await invokeExec({ exec: "{{missing}}" }, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /empty|no command/i);
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
  const result = await invokeDispatch(greetDispatch, { action: "hello" }, testInvoke);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "hi");
});

test("invokeDispatch returns isError when the discriminator is missing", async () => {
  const result = await invokeDispatch(greetDispatch, {}, testInvoke);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /action.*required/i);
});

test("invokeDispatch returns isError when the action is unknown", async () => {
  const result = await invokeDispatch(
    greetDispatch,
    { action: "bogus" },
    testInvoke,
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
  );
  assert.equal(capturedArgs.action, "greet");
  assert.equal(capturedArgs.name, "Alice");
  assert.equal(capturedArgs.extra, "preserved");
});

test("invokeCompute evaluates a simple var reference", async () => {
  const handler: ComputeHandler = { compute: { var: "name" } };
  const result = await invokeCompute(handler, { name: "Ada" });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "Ada");
});

test("invokeCompute evaluates a helper call", async () => {
  const handler: ComputeHandler = { compute: { "os.platform": [] } };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(typeof result.content[0]!.text, "string");
  assert.ok(result.content[0]!.text.length > 0);
});

test("invokeCompute JSON-stringifies object results", async () => {
  // preserve keeps the object literal from being interpreted as operators.
  const handler: ComputeHandler = {
    compute: { preserve: { a: 1, b: "two" } },
  };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, '{"a":1,"b":"two"}');
});

test("invokeCompute stringifies null/undefined as the literal strings", async () => {
  const handler: ComputeHandler = { compute: { var: "missing" } };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]!.text, "null");
});

test("invokeCompute returns isError when the engine throws", async () => {
  // An unknown operator throws at the engine boundary.
  const handler: ComputeHandler = { compute: { unknownOperator: [1, 2] } as unknown as JsonLogicRule };
  const result = await invokeCompute(handler, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /compute:/i);
});
