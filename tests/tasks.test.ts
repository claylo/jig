import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a tasks: block with a single workflow", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  process_job:
    initial: queued
    states:
      queued:
        mcpStatus: working
        statusMessage: "Queued"
        actions:
          - inline: { text: started }
        on:
          - target: done
      done:
        mcpStatus: completed
        result:
          text: "Job complete"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.tasks, "tasks must be present");
  const w = cfg.tasks["process_job"]!;
  assert.equal(w.initial, "queued");
  assert.equal(Object.keys(w.states).length, 2);
  assert.equal(w.states["queued"]!.mcpStatus, "working");
  assert.equal(w.states["queued"]!.statusMessage, "Queued");
  assert.equal(w.states["queued"]!.actions!.length, 1);
  assert.equal(w.states["queued"]!.on!.length, 1);
  assert.equal(w.states["queued"]!.on![0]!.target, "done");
  assert.equal(w.states["done"]!.mcpStatus, "completed");
  assert.equal(w.states["done"]!.result!.text, "Job complete");
});

test("config accepts absent tasks: block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tasks, undefined);
});

test("config rejects tasks: that isn't a mapping", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks: [a, b]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks must be a mapping/);
});

test("config rejects a workflow without initial:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks\.w\.initial is required/);
});

test("config rejects a workflow whose initial: is not a declared state", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: missing
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.initial "missing" is not a declared state/,
  );
});

test("config rejects a workflow with no states:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks\.w\.states is required/);
});

test("config rejects a state with mcpStatus: input_required", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*Plan 9/i,
  );
});

test("config rejects a state with mcpStatus: cancelled", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: cancelled
        result: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /cancelled.*client-initiated/i,
  );
});

test("config rejects a state with bogus mcpStatus", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: bogus
        result: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /mcpStatus must be one of "working", "completed", "failed"/,
  );
});

test("config rejects a terminal state without result:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*requires.*result/i,
  );
});

test("config rejects a terminal state that declares actions:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
        result: { text: x }
        actions:
          - inline: { text: nope }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*MUST NOT declare actions/i,
  );
});

test("config rejects a terminal state that declares on:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: completed
        result: { text: x }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: y } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*terminal.*MUST NOT declare on/i,
  );
});

test("config rejects a non-terminal state without on:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        actions:
          - inline: { text: x }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*non-terminal.*requires.*on/i,
  );
});

test("config rejects a non-terminal state that declares result:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
        result: { text: nope }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a.*non-terminal.*MUST NOT declare result/i,
  );
});

test("config rejects a transition whose target: is not a declared state", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: nowhere
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]\.target "nowhere" is not a declared state/,
  );
});

test("config rejects a state with elicitation: (Plan 9)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        elicitation:
          message: "approve?"
          schema:
            approved: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation.*Plan 9/i,
  );
});

test("config rejects a state with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
        bogus: 42
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a: unknown key "bogus"/,
  );
});

test("config rejects a transition with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - target: b
            sneaky: yes
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]: unknown key "sneaky"/,
  );
});

test("config rejects a transition with no target:", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        on:
          - when: { "==": [1, 1] }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tasks\.w\.states\.a\.on\[0\]\.target is required/,
  );
});
