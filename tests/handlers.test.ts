import { test } from "node:test";
import assert from "node:assert/strict";
import { invokeExec } from "../src/runtime/handlers/exec.ts";

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
