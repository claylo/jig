import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";

test("evaluate resolves a literal value", async () => {
  const result = await evaluate(42 as JsonLogicRule, {});
  assert.equal(result, 42);
});

test("evaluate resolves a var reference against data", async () => {
  const result = await evaluate({ var: "name" } as JsonLogicRule, { name: "Ada" });
  assert.equal(result, "Ada");
});

test("evaluate resolves a comparison", async () => {
  const rule: JsonLogicRule = { "==": [{ var: "a" }, 1] };
  assert.equal(await evaluate(rule, { a: 1 }), true);
  assert.equal(await evaluate(rule, { a: 2 }), false);
});

test("evaluate resolves AND logic", async () => {
  const rule: JsonLogicRule = {
    and: [
      { "==": [{ var: "a" }, 1] },
      { ">": [{ var: "b" }, 0] },
    ],
  };
  assert.equal(await evaluate(rule, { a: 1, b: 5 }), true);
  assert.equal(await evaluate(rule, { a: 1, b: -1 }), false);
});

test("evaluate treats a missing var as null (not thrown)", async () => {
  const result = await evaluate({ var: "missing" } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("evaluate returns a nested object when the rule is an object literal under `preserve`", async () => {
  // json-logic-engine's `preserve` operator keeps a nested object as-is
  // without trying to evaluate its keys as operators.
  const rule: JsonLogicRule = { preserve: { k: 1 } };
  assert.deepEqual(await evaluate(rule, {}), { k: 1 });
});
