import type { PromptArgumentSpec, PromptSpec, PromptsConfig } from "./config.ts";

const PROMPT_KNOWN = new Set(["name", "description", "arguments", "template"]);
const ARG_KNOWN = new Set(["name", "description", "required"]);

/**
 * Validate the top-level `prompts:` block.
 *
 * Rules:
 *   - prompts is undefined OR an array
 *   - each entry: name (required non-empty string, unique across block),
 *     description (optional string), template (required non-empty string),
 *     arguments (optional array of { name, description?, required? })
 *   - argument names are unique within each prompt
 *   - unknown keys rejected at prompt and argument level
 */
export function validatePrompts(v: unknown): PromptsConfig | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new Error("config: prompts must be an array");
  }
  const out: PromptsConfig = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptEntry(v[i], i, seenNames));
  }
  return out;
}

function validatePromptEntry(
  entry: unknown,
  index: number,
  seenNames: Set<string>,
): PromptSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${index}] must be a mapping`);
  }
  const e = entry as Record<string, unknown>;

  for (const key of Object.keys(e)) {
    if (!PROMPT_KNOWN.has(key)) {
      throw new Error(`config: prompts[${index}]: unknown key "${key}"`);
    }
  }

  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: prompts[${index}].name is required and must be a non-empty string`);
  }
  const name = e["name"];
  if (seenNames.has(name)) {
    throw new Error(`config: prompts: duplicate prompt name "${name}"`);
  }
  seenNames.add(name);

  if (e["description"] !== undefined && typeof e["description"] !== "string") {
    throw new Error(`config: prompts[${index}].description must be a string`);
  }

  if (typeof e["template"] !== "string" || e["template"].length === 0) {
    throw new Error(`config: prompts[${index}].template is required and must be a non-empty string`);
  }

  const args = e["arguments"] === undefined
    ? undefined
    : validatePromptArguments(e["arguments"], index);

  const out: PromptSpec = { name, template: e["template"] };
  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (args !== undefined) out.arguments = args;
  return out;
}

function validatePromptArguments(v: unknown, promptIndex: number): PromptArgumentSpec[] {
  if (!Array.isArray(v)) {
    throw new Error(`config: prompts[${promptIndex}].arguments must be an array`);
  }
  const out: PromptArgumentSpec[] = [];
  const seenArgNames = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validatePromptArgument(v[i], promptIndex, i, seenArgNames));
  }
  return out;
}

function validatePromptArgument(
  entry: unknown,
  promptIndex: number,
  argIndex: number,
  seen: Set<string>,
): PromptArgumentSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: prompts[${promptIndex}].arguments[${argIndex}] must be a mapping`);
  }
  const a = entry as Record<string, unknown>;

  for (const key of Object.keys(a)) {
    if (!ARG_KNOWN.has(key)) {
      throw new Error(
        `config: prompts[${promptIndex}].arguments[${argIndex}]: unknown key "${key}"`,
      );
    }
  }

  if (typeof a["name"] !== "string" || a["name"].length === 0) {
    throw new Error(
      `config: prompts[${promptIndex}].arguments[${argIndex}].name is required and must be a non-empty string`,
    );
  }
  const name = a["name"];
  if (seen.has(name)) {
    throw new Error(`config: prompts[${promptIndex}]: duplicate argument name "${name}"`);
  }
  seen.add(name);

  const out: PromptArgumentSpec = { name };
  if (typeof a["description"] === "string") out.description = a["description"];
  if (a["required"] !== undefined) out.required = a["required"] === true;
  return out;
}
