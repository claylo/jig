import type { ToolDefinition } from "./config.ts";

/**
 * Lean JSON Schema 2020-12 object shape produced from a YAML `input:` block.
 * This is the value the adapter in `server.ts` feeds through `fromJsonSchema()`
 * to get the Standard Schema that `McpServer.registerTool` requires.
 *
 * Plan 1 only emits primitive-typed properties. Nested objects, arrays of
 * typed items, enum constraints, and per-field validators arrive in later
 * plans when the YAML surface grows to need them.
 */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/**
 * Synthesize a JSON Schema `object` from a `ToolDefinition.input` block.
 *
 * - No `input` block → `{ type: "object", properties: {} }` (open, empty).
 * - Fields with `required: true` move into `required: [...]` on the root.
 * - `description` on a field is carried through when present.
 *
 * `required` is only emitted when at least one field is required, so the
 * output round-trips cleanly through `deepEqual` against hand-written JSON
 * Schemas in tests.
 */
export function toolToInputSchema(tool: ToolDefinition): JsonSchemaObject {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  if (tool.input) {
    for (const [field, schema] of Object.entries(tool.input)) {
      const prop: { type: string; description?: string } = { type: schema.type };
      if (schema.description) prop.description = schema.description;
      properties[field] = prop;
      if (schema.required) required.push(field);
    }
  }
  const out: JsonSchemaObject = { type: "object", properties };
  if (required.length > 0) out.required = required;
  return out;
}
