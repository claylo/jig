import type { CompletionsConfig, PromptsConfig, ResourcesConfig } from "./config.ts";

/**
 * Extract RFC 6570 variable names from a template string.
 * Only handles simple {varName} expansions (no modifiers).
 */
function extractTemplateVars(template: string): Set<string> {
  const vars = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    // Strip RFC 6570 modifiers (+, #, ., /, ;, ?, &, =, ,, !, @, |)
    const raw = m[1]!.replace(/^[+#./;?&=,!@|]/, "");
    for (const part of raw.split(",")) {
      vars.add(part.trim().replace(/\*$/, ""));
    }
  }
  return vars;
}

/**
 * Validate the top-level `completions:` block with cross-reference checks.
 *
 * Called after individual block validation — requires parsed prompts and
 * resources to verify refs. Errors name the exact YAML path that failed.
 *
 * Rules:
 *   - completions is undefined OR a mapping
 *   - completions.prompts is undefined OR a mapping: promptName -> argName -> string[]
 *     - promptName must exist in prompts
 *     - argName must exist in that prompt's arguments
 *     - value must be a non-empty string array
 *   - completions.resources is undefined OR a mapping: templateString -> varName -> string[]
 *     - templateString must match a declared resource with template: (exact string match)
 *     - varName must be one of the {vars} in that template
 *     - value must be a non-empty string array
 *   - unknown keys at the top level of completions are rejected
 */
export function validateCompletions(
  v: unknown,
  prompts: PromptsConfig | undefined,
  resources: ResourcesConfig | undefined,
): CompletionsConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions must be a mapping");
  }
  const raw = v as Record<string, unknown>;

  const knownTopKeys = new Set(["prompts", "resources"]);
  for (const key of Object.keys(raw)) {
    if (!knownTopKeys.has(key)) {
      throw new Error(`config: completions: unknown key "${key}"`);
    }
  }

  const out: CompletionsConfig = {};

  if (raw["prompts"] !== undefined) {
    out.prompts = validateCompletionPrompts(raw["prompts"], prompts);
  }

  if (raw["resources"] !== undefined) {
    out.resources = validateCompletionResources(raw["resources"], resources);
  }

  return out;
}

function validateCompletionPrompts(
  v: unknown,
  prompts: PromptsConfig | undefined,
): Record<string, Record<string, string[]>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.prompts must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [promptName, argMap] of Object.entries(raw)) {
    const prompt = prompts?.find((p) => p.name === promptName);
    if (!prompt) {
      throw new Error(
        `config: completions.prompts.${promptName}: prompt "${promptName}" not found in prompts:`,
      );
    }
    if (!argMap || typeof argMap !== "object" || Array.isArray(argMap)) {
      throw new Error(
        `config: completions.prompts.${promptName} must be a mapping of argName -> string[]`,
      );
    }
    const argMapRaw = argMap as Record<string, unknown>;
    out[promptName] = {};
    for (const [argName, values] of Object.entries(argMapRaw)) {
      const argExists = prompt.arguments?.some((a) => a.name === argName);
      if (!argExists) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName}: argument "${argName}" not found in prompt "${promptName}"`,
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.prompts.${promptName}.${argName} must be an array of strings`,
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.prompts.${promptName}.${argName}: all values must be strings`,
          );
        }
      }
      out[promptName]![argName] = values as string[];
    }
  }
  return out;
}

function validateCompletionResources(
  v: unknown,
  resources: ResourcesConfig | undefined,
): Record<string, Record<string, string[]>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: completions.resources must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: Record<string, Record<string, string[]>> = {};

  // Build a map from template string -> Set<varName> for quick lookup
  const templateVarMap = new Map<string, Set<string>>();
  if (resources) {
    for (const spec of resources) {
      if (typeof spec.template === "string") {
        templateVarMap.set(spec.template, extractTemplateVars(spec.template));
      }
    }
  }

  for (const [templateString, varMap] of Object.entries(raw)) {
    const knownVars = templateVarMap.get(templateString);
    if (!knownVars) {
      throw new Error(
        `config: completions.resources."${templateString}": template "${templateString}" not found in resources:`,
      );
    }
    if (!varMap || typeof varMap !== "object" || Array.isArray(varMap)) {
      throw new Error(
        `config: completions.resources."${templateString}" must be a mapping of varName -> string[]`,
      );
    }
    const varMapRaw = varMap as Record<string, unknown>;
    out[templateString] = {};
    for (const [varName, values] of Object.entries(varMapRaw)) {
      if (!knownVars.has(varName)) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName}: "${varName}" is not a variable in template "${templateString}"`,
        );
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(
          `config: completions.resources."${templateString}".${varName} must be an array of strings`,
        );
      }
      for (const val of values) {
        if (typeof val !== "string") {
          throw new Error(
            `config: completions.resources."${templateString}".${varName}: all values must be strings`,
          );
        }
      }
      out[templateString]![varName] = values as string[];
    }
  }
  return out;
}
