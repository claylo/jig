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
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke);
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
  const result = await invokeDispatch(guarded, { action: "go" }, testInvoke);
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
  const pass = await invokeDispatch(guarded, { action: "go", flag: true }, testInvoke);
  assert.equal(pass.isError, undefined);
  const block = await invokeDispatch(guarded, { action: "go", flag: false }, testInvoke);
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
  );
  assert.equal(ok.isError, undefined);
  // when fails — report guard failure (when is checked before requires)
  const whenFail = await invokeDispatch(
    both,
    { action: "go", id: "x", flag: false },
    testInvoke,
  );
  assert.equal(whenFail.isError, true);
  assert.match(whenFail.content[0]!.text, /guard/i);
  // when passes, requires fails
  const requiresFail = await invokeDispatch(
    both,
    { action: "go", flag: true },
    testInvoke,
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
  const result = await invokeDispatch(broken, { action: "go" }, testInvoke);
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /guard.*go/i);
});
