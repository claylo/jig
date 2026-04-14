import { test } from "node:test";
import assert from "node:assert/strict";
import type { ToolDefinition } from "../src/runtime/config.ts";
import { toolToInputSchema } from "../src/runtime/tools.ts";
import { invokeInline } from "../src/runtime/handlers/inline.ts";

test("toolToInputSchema handles no input block", () => {
  const tool: ToolDefinition = {
    name: "noop",
    description: "x",
    handler: { inline: { text: "ok" } },
  };
  assert.deepEqual(toolToInputSchema(tool), {
    type: "object",
    properties: {},
  });
});

test("toolToInputSchema maps a typed field", () => {
  const tool: ToolDefinition = {
    name: "greet",
    description: "x",
    input: {
      name: { type: "string", required: true, description: "Who to greet" },
      loud: { type: "boolean" },
    },
    handler: { inline: { text: "ok" } },
  };
  assert.deepEqual(toolToInputSchema(tool), {
    type: "object",
    properties: {
      name: { type: "string", description: "Who to greet" },
      loud: { type: "boolean" },
    },
    required: ["name"],
  });
});

test("invokeInline returns the configured text as an MCP content block", () => {
  const result = invokeInline({ inline: { text: "pong" } });
  assert.deepEqual(result, {
    content: [{ type: "text", text: "pong" }],
  });
});

test("toolToInputSchema emits enum for the dispatch discriminator", () => {
  const tool: ToolDefinition = {
    name: "linear",
    description: "x",
    input: {
      action: { type: "string", required: true },
      id: { type: "string" },
    },
    handler: {
      dispatch: {
        on: "action",
        cases: {
          get: { requires: ["id"], handler: { inline: { text: "g" } } },
          search: { handler: { inline: { text: "s" } } },
        },
      },
    },
  };
  const schema = toolToInputSchema(tool);
  assert.deepEqual(schema.properties["action"], {
    type: "string",
    enum: ["get", "search"],
  });
});
