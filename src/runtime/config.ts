import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ServerMetadata {
  name: string;
  version: string;
  description?: string;
  instructions?: string;
}

export interface InputFieldSchema {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  description?: string;
}

export interface InlineHandler {
  inline: { text: string };
}

export type Handler = InlineHandler;
// Discriminated union expands in later plans: ExecHandler | HttpHandler | ...

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
  };
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
  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (Plan 1 supports: inline)`,
  );
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
