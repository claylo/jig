import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, validateHandlerPublic } from "../src/runtime/config.ts";
import {
  validateTasks,
  interpretWorkflow,
} from "../src/runtime/tasks.ts";
import { invoke as invokeHandler } from "../src/runtime/handlers/index.ts";

test("config accepts a tasks: block with a single workflow", () => {
  const yamlText = `
version: "1"
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
version: "1"
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tasks, undefined);
});

test("config rejects tasks: that isn't a mapping", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks: [a, b]
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks must be a mapping/);
});

test("config rejects a workflow without initial:", () => {
  const yamlText = `
version: "1"
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
version: "1"
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
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /tasks\.w\.states is required/);
});

test("config accepts a state with mcpStatus: input_required and elicitation:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        statusMessage: "Waiting for input"
        elicitation:
          message: "Approve?"
          schema:
            approved: { type: boolean }
        on:
          - target: done
      done: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  const cfg = parseConfig(yamlText);
  const state = cfg.tasks!["w"]!.states["ask"]!;
  assert.equal(state.mcpStatus, "input_required");
  assert.equal(state.elicitation!.message, "Approve?");
  assert.deepEqual(Object.keys(state.elicitation!.schema), ["approved"]);
  assert.equal(state.elicitation!.schema["approved"]!.type, "boolean");
});

test("config rejects a state with mcpStatus: cancelled", () => {
  const yamlText = `
version: "1"
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
version: "1"
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
    /mcpStatus must be one of "working", "input_required", "completed", "failed"/,
  );
});

test("config rejects a terminal state without result:", () => {
  const yamlText = `
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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
version: "1"
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

test("config rejects elicitation: on a working state (only valid on input_required)", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: working
        elicitation:
          message: "nope"
          schema:
            x: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation.*only valid.*input_required/i,
  );
});

test("config rejects a state with an unknown top-level key", () => {
  const yamlText = `
version: "1"
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

test("config rejects input_required without elicitation:", () => {
  const yamlText = `
version: "1"
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
    /input_required.*requires.*elicitation/i,
  );
});

test("config rejects input_required with actions:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
        actions:
          - inline: { text: nope }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*MUST NOT.*actions/i,
  );
});

test("config rejects input_required without on:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*requires.*on/i,
  );
});

test("config rejects input_required with result:", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            ok: { type: boolean }
        on:
          - target: b
        result: { text: nope }
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /input_required.*MUST NOT.*result/i,
  );
});

test("config rejects elicitation: with missing message", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          schema:
            ok: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.message.*required/i,
  );
});

test("config rejects elicitation: with missing schema", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema.*required/i,
  );
});

test("config rejects elicitation: with empty schema", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema: {}
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema.*at least one field/i,
  );
});

test("config rejects elicitation field with invalid type", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          schema:
            name: { type: object }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /elicitation\.schema\.name\.type must be one of/i,
  );
});

test("config rejects elicitation.required listing an undeclared field", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a:
        mcpStatus: input_required
        elicitation:
          message: "x"
          required: [ghost]
          schema:
            ok: { type: boolean }
        on:
          - target: b
      b: { mcpStatus: completed, result: { text: x } }
tools: []
`;
  assert.throws(
    () => parseConfig(yamlText),
    /required.*"ghost".*not in schema/i,
  );
});

test("config accepts elicitation with required + multiple field types", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: ask
    states:
      ask:
        mcpStatus: input_required
        elicitation:
          message: "Configure"
          required: [env]
          schema:
            env:
              type: string
              enum: [staging, production]
            count:
              type: integer
              minimum: 1
              maximum: 10
            notify:
              type: boolean
              default: true
        on:
          - target: done
      done: { mcpStatus: completed, result: { text: ok } }
tools: []
`;
  const cfg = parseConfig(yamlText);
  const el = cfg.tasks!["w"]!.states["ask"]!.elicitation!;
  assert.deepEqual(el.required, ["env"]);
  assert.equal(el.schema["env"]!.type, "string");
  assert.deepEqual(el.schema["env"]!.enum, ["staging", "production"]);
  assert.equal(el.schema["count"]!.type, "integer");
  assert.equal(el.schema["count"]!.minimum, 1);
  assert.equal(el.schema["notify"]!.type, "boolean");
  assert.equal(el.schema["notify"]!.default, true);
});

test("config rejects a transition with an unknown key", () => {
  const yamlText = `
version: "1"
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
version: "1"
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

// ─── Interpreter tests ────────────────────────────────────────────────

// Stub task store collecting status updates and the terminal result.
function makeTrackingStore() {
  const statusUpdates: Array<{ status: string; statusMessage?: string }> = [];
  const results: Array<{ status: string; result: unknown }> = [];
  return {
    statusUpdates,
    results,
    store: {
      async createTask() {
        return { taskId: "stub-task", status: "working", createdAt: 0, ttl: 60_000 };
      },
      async getTask(taskId: string) {
        return { taskId, status: statusUpdates.at(-1)?.status ?? "working", createdAt: 0, ttl: 60_000 };
      },
      async getTaskResult() {
        return results.at(-1)?.result;
      },
      async storeTaskResult(_taskId: string, status: "completed" | "failed", result: unknown) {
        results.push({ status, result });
      },
      async updateTaskStatus(_taskId: string, status: string, statusMessage?: string) {
        statusUpdates.push({ status, statusMessage });
      },
    },
  };
}

/** No-op elicit stub — phases before Phase 4 never hit input_required states. */
const noopElicit = async (): Promise<{ action: "cancel" }> => ({ action: "cancel" });

test("interpreter runs a single-state workflow that goes straight to a completed terminal", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "done",
        states: {
          done: { mcpStatus: "completed", result: { text: "instant" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  assert.equal(tracker.results.length, 1);
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "instant");
});

test("interpreter chains states: working -> completed via unguarded transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "step1",
        states: {
          step1: {
            mcpStatus: "working",
            statusMessage: "step 1",
            actions: [{ inline: { text: "ran step 1" } }],
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "all done" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  assert.ok(
    tracker.statusUpdates.some((u) => u.status === "working" && u.statusMessage === "step 1"),
    "working status pushed",
  );
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "all done");
});

test("interpreter picks the first matching when: transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "decide",
        states: {
          decide: {
            mcpStatus: "working",
            actions: [{ inline: { text: '{"valid": true}' } }],
            on: [
              { when: { "==": [{ var: "result.valid" }, false] }, target: "rejected" },
              { when: { "==": [{ var: "result.valid" }, true] }, target: "approved" },
            ],
          },
          approved: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "approved");
});

test("interpreter Mustache-renders the terminal result with input/result/probe", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "compute",
        states: {
          compute: {
            mcpStatus: "working",
            actions: [{ inline: { text: '{"answer": 42}' } }],
            on: [{ target: "done" }],
          },
          done: {
            mcpStatus: "completed",
            result: { text: "input={{input.q}} answer={{result.answer}} probe={{probe.host}}" },
          },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: { q: "life" },
    ctx: { connections: {}, probe: { host: "localhost" } },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "input=life answer=42 probe=localhost");
});

test("interpreter fails the task when an action returns isError: true", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "boom",
        states: {
          boom: {
            mcpStatus: "working",
            actions: [{ exec: ["false"] }], // exits non-zero, becomes isError
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "should not reach" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }>; isError?: boolean };
  assert.ok(r.isError);
  assert.match(r.content[0]!.text, /action.*failed/i);
});

test("interpreter fails the task when no transition matches and state has no result", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "stuck",
        states: {
          stuck: {
            mcpStatus: "working",
            actions: [{ inline: { text: "x" } }],
            on: [{ when: { "==": [1, 0] }, target: "never" }],
          },
          never: { mcpStatus: "completed", result: { text: "unreachable" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: noopElicit,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.match(r.content[0]!.text, /no transition matched/i);
});

test("interpreter handles input_required: elicit → accept → transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            statusMessage: "Need approval",
            elicitation: {
              message: "Approve?",
              schema: {
                approved: { type: "boolean" },
              },
            },
            on: [
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "accept" as const,
    content: { approved: true },
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.ok(
    tracker.statusUpdates.some((u) => u.status === "input_required"),
    "input_required status pushed",
  );
  assert.equal(tracker.results[0]!.status, "completed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "approved");
});

test("interpreter handles input_required: elicit → decline → fallback transition", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "declined" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "decline" as const,
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "declined");
});

test("interpreter safeFails when elicit throws", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [{ target: "done" }],
          },
          done: { mcpStatus: "completed", result: { text: "ok" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => {
    throw new Error("Client does not support elicitation");
  };
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }>; isError?: boolean };
  assert.ok(r.isError);
  assert.match(r.content[0]!.text, /elicitation failed|Client does not support/i);
});

test("interpreter exposes elicitation.action for explicit cancel routing", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Approve?",
              schema: { approved: { type: "boolean" } },
            },
            on: [
              { when: { "==": [{ "var": "elicitation.action" }, "cancel"] }, target: "cancelled" },
              { when: { "var": "elicitation.approved" }, target: "done" },
              { target: "rejected" },
            ],
          },
          done: { mcpStatus: "completed", result: { text: "approved" } },
          rejected: { mcpStatus: "failed", result: { text: "rejected" } },
          cancelled: { mcpStatus: "failed", result: { text: "user cancelled" } },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "cancel" as const,
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  assert.equal(tracker.results[0]!.status, "failed");
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "user cancelled");
});

test("interpreter renders elicitation fields in terminal result text", async () => {
  const cfg = validateTasks(
    {
      w: {
        initial: "ask",
        states: {
          ask: {
            mcpStatus: "input_required",
            elicitation: {
              message: "Name?",
              schema: { name: { type: "string" } },
            },
            on: [{ target: "done" }],
          },
          done: {
            mcpStatus: "completed",
            result: { text: "Hello {{elicitation.name}}!" },
          },
        },
      },
    },
    validateHandlerPublic,
  );
  const tracker = makeTrackingStore();
  const elicitStub = async () => ({
    action: "accept" as const,
    content: { name: "Clay" },
  });
  await interpretWorkflow({
    workflow: cfg!["w"]!,
    args: {},
    ctx: { connections: {}, probe: {} },
    store: tracker.store,
    taskId: "stub-task",
    invoke: invokeHandler,
    elicit: elicitStub,
  });
  const r = tracker.results[0]!.result as { content: Array<{ text: string }> };
  assert.equal(r.content[0]!.text, "Hello Clay!");
});

// ─── Cross-ref tests ──────────────────────────────────────────────────

test("config rejects a workflow handler on a tool without execution.taskSupport", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    handler:
      workflow: { ref: w }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*workflow case.*requires execution\.taskSupport/i,
  );
});

test("config rejects a task tool with an inline outer handler (not workflow or dispatch)", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
    handler:
      inline: { text: x }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*task tool.*requires the outer handler to be workflow: or dispatch:/i,
  );
});

test("config rejects a workflow.ref that doesn't resolve", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    execution:
      taskSupport: required
    handler:
      workflow: { ref: "no_such_workflow" }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\]\.handler\.workflow\.ref "no_such_workflow" not found in tasks:/,
  );
});

test("config accepts a properly wired task tool", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: ok
    description: x
    execution:
      taskSupport: required
    handler:
      workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "required");
  assert.ok("workflow" in cfg.tools[0]!.handler);
});

// Phase 7: dispatcher-task fusion cross-ref tests

test("config accepts a task tool with a dispatch handler whose case routes to a workflow", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: jobs
    description: x
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
              inline: { text: "help text" }
          run:
            handler:
              workflow: { ref: w }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
  assert.ok("dispatch" in cfg.tools[0]!.handler);
});

test("config rejects a non-task tool with a dispatch handler containing a workflow case", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    input:
      action: { type: string, required: true }
    handler:
      dispatch:
        on: action
        cases:
          help:
            handler:
              inline: { text: x }
          run:
            handler:
              workflow: { ref: w }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\].*workflow case.*requires execution\.taskSupport/i,
  );
});

test("config rejects a workflow.ref inside a dispatch case that doesn't resolve", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tasks:
  w:
    initial: a
    states:
      a: { mcpStatus: completed, result: { text: x } }
tools:
  - name: bad
    description: x
    input:
      action: { type: string, required: true }
    execution:
      taskSupport: required
    handler:
      dispatch:
        on: action
        cases:
          run:
            handler:
              workflow: { ref: "no_such" }
`;
  assert.throws(
    () => parseConfig(yamlText),
    /tools\[bad\]\.handler\.dispatch\.cases\.run\.handler\.workflow\.ref "no_such" not found in tasks:/,
  );
});

test("config accepts a task tool with dispatch and NO workflow cases (all sync)", () => {
  const yamlText = `
version: "1"
server: { name: t, version: "0.0.1" }
tools:
  - name: jobs
    description: x
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
              inline: { text: "help" }
          list:
            handler:
              inline: { text: "[]" }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.tools[0]!.execution?.taskSupport, "optional");
});
