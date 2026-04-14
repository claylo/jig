import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SecurityConfig } from "./util/access.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";

export type { SecurityConfig };

export interface ServerMetadata {
  name: string;
  version: string;
  description?: string;
  instructions?: string;
  security?: SecurityConfig;
}

export interface InputFieldSchema {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  description?: string;
}

export interface InlineHandler {
  inline: { text: string };
}

export interface ExecHandler {
  exec: string;
}

export interface DispatchCase {
  requires?: string[];
  handler: Handler;
}

export interface DispatchHandler {
  dispatch: {
    on: string;
    cases: Record<string, DispatchCase>;
  };
}

export interface ComputeHandler {
  compute: JsonLogicRule;
}

export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler;
// HttpHandler and GraphqlHandler land in Plan 4.

export interface ToolDefinition {
  name: string;
  description: string;
  input?: Record<string, InputFieldSchema>;
  handler: Handler;
}

export interface JigConfig {
  server: ServerMetadata;
  tools: ToolDefinition[];
}

export function parseConfig(yamlText: string): JigConfig {
  const raw = parseYaml(yamlText) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("config: YAML root must be a mapping");
  }
  const obj = raw as Record<string, unknown>;

  const server = validateServer(obj["server"]);
  const tools = validateTools(obj["tools"]);

  return { server, tools };
}

function validateServer(v: unknown): ServerMetadata {
  if (!v || typeof v !== "object") {
    throw new Error("config: server block is required");
  }
  const s = v as Record<string, unknown>;
  if (typeof s["name"] !== "string" || s["name"].length === 0) {
    throw new Error("config: server.name is required and must be a string");
  }
  if (typeof s["version"] !== "string" || s["version"].length === 0) {
    throw new Error("config: server.version is required and must be a string");
  }
  return {
    name: s["name"],
    version: s["version"],
    description: typeof s["description"] === "string" ? s["description"] : undefined,
    instructions: typeof s["instructions"] === "string" ? s["instructions"] : undefined,
    security: validateSecurity(s["security"]),
  };
}

/**
 * Validate and return a SecurityConfig from raw parsed YAML. Stores raw
 * strings — $VAR / ~ / . expansion happens in configureAccess at boot.
 */
function validateSecurity(v: unknown): SecurityConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object") {
    throw new Error("config: server.security must be a mapping");
  }
  const sec = v as Record<string, unknown>;

  // Reject unknown top-level keys
  const knownKeys = new Set(["filesystem", "env"]);
  for (const key of Object.keys(sec)) {
    if (!knownKeys.has(key)) {
      throw new Error(`config: security: unknown key "${key}"`);
    }
  }

  const result: SecurityConfig = {};

  if (sec["filesystem"] !== undefined) {
    if (!sec["filesystem"] || typeof sec["filesystem"] !== "object") {
      throw new Error("config: security.filesystem must be a mapping");
    }
    const fs = sec["filesystem"] as Record<string, unknown>;
    if (fs["allow"] !== undefined) {
      if (!Array.isArray(fs["allow"])) {
        throw new Error("config: security.filesystem.allow must be an array of strings");
      }
      for (const entry of fs["allow"]) {
        if (typeof entry !== "string" || entry.length === 0) {
          throw new Error("config: security.filesystem.allow entries must be non-empty strings");
        }
      }
      result.filesystem = { allow: fs["allow"] as string[] };
    } else {
      result.filesystem = {};
    }
  }

  if (sec["env"] !== undefined) {
    if (!sec["env"] || typeof sec["env"] !== "object") {
      throw new Error("config: security.env must be a mapping");
    }
    const env = sec["env"] as Record<string, unknown>;
    if (env["allow"] !== undefined) {
      if (!Array.isArray(env["allow"])) {
        throw new Error("config: security.env.allow must be an array of strings");
      }
      for (const entry of env["allow"]) {
        if (typeof entry !== "string" || entry.length === 0) {
          throw new Error("config: security.env.allow entries must be non-empty strings");
        }
      }
      result.env = { allow: env["allow"] as string[] };
    } else {
      result.env = {};
    }
  }

  return result;
}

function validateTools(v: unknown): ToolDefinition[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error("config: tools must be an array");
  }
  return v.map((entry, i) => validateTool(entry, i));
}

function validateTool(entry: unknown, index: number): ToolDefinition {
  if (!entry || typeof entry !== "object") {
    throw new Error(`config: tools[${index}] must be a mapping`);
  }
  const t = entry as Record<string, unknown>;
  if (typeof t["name"] !== "string" || t["name"].length === 0) {
    throw new Error(`config: tools[${index}].name is required`);
  }
  if (typeof t["description"] !== "string") {
    throw new Error(`config: tools[${index}].description is required`);
  }
  if (!t["handler"] || typeof t["handler"] !== "object") {
    throw new Error(`config: tools[${index}].handler is required`);
  }
  const handler = validateHandler(t["handler"], t["name"]);
  return {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler,
  };
}

function validateInput(
  v: unknown,
  toolName: string,
): Record<string, InputFieldSchema> | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].input must be a mapping`);
  }
  const out: Record<string, InputFieldSchema> = {};
  for (const [field, schema] of Object.entries(v)) {
    if (!schema || typeof schema !== "object") {
      throw new Error(`config: tools[${toolName}].input.${field} must be a mapping`);
    }
    const s = schema as Record<string, unknown>;
    if (typeof s["type"] !== "string") {
      throw new Error(`config: tools[${toolName}].input.${field}.type is required`);
    }
    out[field] = {
      type: s["type"] as InputFieldSchema["type"],
      required: s["required"] === true,
      description:
        typeof s["description"] === "string" ? s["description"] : undefined,
    };
  }
  return out;
}

function validateHandler(v: unknown, toolName: string): Handler {
  if (!v || typeof v !== "object") {
    throw new Error(`config: tools[${toolName}].handler must be a mapping`);
  }
  const h = v as Record<string, unknown>;

  if (h["inline"] && typeof h["inline"] === "object") {
    const inline = h["inline"] as Record<string, unknown>;
    if (typeof inline["text"] !== "string") {
      throw new Error(
        `config: tools[${toolName}].handler.inline.text must be a string`,
      );
    }
    return { inline: { text: inline["text"] } };
  }

  if (typeof h["exec"] === "string") {
    if (h["exec"].length === 0) {
      throw new Error(
        `config: tools[${toolName}].handler.exec must be a non-empty string`,
      );
    }
    return { exec: h["exec"] };
  }

  if (h["dispatch"] && typeof h["dispatch"] === "object") {
    return validateDispatch(h["dispatch"], toolName);
  }

  if ("compute" in h) {
    // JSONLogic rules are arbitrary JSON; we do no structural validation
    // at parse time. Unknown operators surface at invoke time as isError
    // tool results, not as config errors.
    return { compute: h["compute"] };
  }

  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (Plan 3 supports: inline, exec, dispatch, compute)`,
  );
}

function validateDispatch(v: unknown, toolName: string): DispatchHandler {
  const d = v as Record<string, unknown>;
  if (typeof d["on"] !== "string" || d["on"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.on is required and must be a string`,
    );
  }
  if (!d["cases"] || typeof d["cases"] !== "object") {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must be a mapping`,
    );
  }
  const rawCases = d["cases"] as Record<string, unknown>;
  const caseNames = Object.keys(rawCases);
  if (caseNames.length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.dispatch.cases must declare at least one case`,
    );
  }
  const cases: Record<string, DispatchCase> = {};
  for (const name of caseNames) {
    const entry = rawCases[name];
    if (!entry || typeof entry !== "object") {
      throw new Error(
        `config: tools[${toolName}].handler.dispatch.cases.${name} must be a mapping`,
      );
    }
    const e = entry as Record<string, unknown>;
    const subHandler = validateHandler(e["handler"], `${toolName}:${name}`);
    const requires = e["requires"];
    let requiresValue: string[] | undefined;
    if (requires !== undefined) {
      if (
        !Array.isArray(requires) ||
        !requires.every((r) => typeof r === "string")
      ) {
        throw new Error(
          `config: tools[${toolName}].handler.dispatch.cases.${name}.requires must be an array of strings`,
        );
      }
      requiresValue = requires;
    }
    cases[name] = requiresValue !== undefined
      ? { requires: requiresValue, handler: subHandler }
      : { handler: subHandler };
  }
  return { dispatch: { on: d["on"], cases } };
}

export interface ResolveArgs {
  argv: string[];
  /** `import.meta.url` of the runtime entry point. */
  runtimeUrl: string;
}

/**
 * Pick the YAML file path, preferring `--config PATH` on argv and falling
 * back to `<runtime-dir>/jig.yaml` (ADR-0005: sibling resolution from
 * import.meta.url so GUI MCP clients with unpredictable CWDs still find
 * the config).
 */
export function resolveConfigPath(args: ResolveArgs): string {
  const idx = args.argv.indexOf("--config");
  if (idx !== -1 && idx + 1 < args.argv.length) {
    return args.argv[idx + 1]!;
  }
  const runtimeDir = dirname(fileURLToPath(args.runtimeUrl));
  return `${runtimeDir}/jig.yaml`;
}

export function loadConfigFromFile(path: string): JigConfig {
  const text = readFileSync(path, "utf8");
  return parseConfig(text);
}
