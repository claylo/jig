import type { ToolDefinition } from "./config.ts";

/**
 * Lean JSON Schema 2020-12 object shape produced from a YAML `input:` block.
 * This is the value the adapter in `server.ts` feeds through `fromJsonSchema()`
 * to get the Standard Schema that `McpServer.registerTool` requires.
 *
 * Plan 1 only emits primitive-typed properties. Plan 2 adds `enum` to carry
 * the action list synthesized from a dispatch handler's case names. Nested
 * objects, arrays of typed items, and per-field validators arrive in later
 * plans when the YAML surface grows to need them.
 */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<
    string,
    { type: string; description?: string; enum?: string[] }
  >;
  required?: string[];
}

/**
 * Synthesize a JSON Schema `object` from a `ToolDefinition.input` block.
 *
 * - No `input` block → `{ type: "object", properties: {} }` (open, empty).
 * - Fields with `required: true` move into `required: [...]` on the root.
 * - `description` on a field is carried through when present.
 * - If the tool has a `dispatch` handler, the discriminator field receives
 *   an `enum` constraint whose values are the dispatch case names (ADR-0001).
 *
 * `required` is only emitted when at least one field is required, so the
 * output round-trips cleanly through `deepEqual` against hand-written JSON
 * Schemas in tests.
 */
export function toolToInputSchema(tool: ToolDefinition): JsonSchemaObject {
  const properties: Record<
    string,
    { type: string; description?: string; enum?: string[] }
  > = {};
  const required: string[] = [];
  if (tool.input) {
    for (const [field, schema] of Object.entries(tool.input)) {
      const prop: { type: string; description?: string; enum?: string[] } = {
        type: schema.type,
      };
      if (schema.description) prop.description = schema.description;
      properties[field] = prop;
      if (schema.required) required.push(field);
    }
  }

  // If the tool dispatches on a named field, the set of valid values is
  // the case names. Emit it as `enum` so clients see a concrete action
  // list in tools/list. ADR-0001 (typed flat fields) motivates this:
  // the dispatcher's inputSchema must advertise what actions exist.
  if ("dispatch" in tool.handler) {
    const { on, cases } = tool.handler.dispatch;
    const existing = properties[on];
    if (existing) {
      existing.enum = Object.keys(cases);
    } else {
      properties[on] = { type: "string", enum: Object.keys(cases) };
    }
  }

  const out: JsonSchemaObject = { type: "object", properties };
  if (required.length > 0) out.required = required;
  return out;
}
