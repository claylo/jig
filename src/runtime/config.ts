import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SecurityConfig } from "./util/access.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";
import { expandShimInTree } from "./util/interpolate.ts";
import { validateProbes } from "./probes.ts";
import { validateResources } from "./resources.ts";
import { validatePrompts } from "./prompts.ts";
import { validateCompletions } from "./completions.ts";
import { validateTasks } from "./tasks.ts";

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

/**
 * Tool execution mode. Plan 8: present on tools that opt into the MCP
 * experimental task lifecycle. `taskSupport: "required"` means the tool
 * MUST be invoked as a task (clients without task support get an error);
 * `"optional"` means clients may invoke either as task or as plain
 * tools/call (the SDK auto-polls for the latter). `"forbidden"` is not
 * accepted — omit the execution: block to declare a non-task tool.
 *
 * Plan 8 only wires task tools whose handler is `workflow:`. Non-workflow
 * task tools are rejected at parse time as a v1 scope limitation.
 */
export interface ExecutionConfig {
  taskSupport: "required" | "optional";
}

export interface InlineHandler {
  inline: { text: string };
}

export interface ExecHandler {
  exec: string | string[];
}

export interface DispatchCase {
  requires?: string[];
  when?: JsonLogicRule;
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

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpHandler {
  http: {
    connection?: string;
    method: HttpMethod;
    path?: string;
    url?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown; // string for raw, mapping for JSON auto-serialize
    response?: "body" | "envelope";
    timeout_ms?: number;
  };
}

export interface GraphqlHandler {
  graphql: {
    connection: string;
    query: string;
    variables?: unknown; // YAML mapping → JSON with Mustache in string leaves
    response?: "data" | "envelope";
    timeout_ms?: number;
  };
}

/**
 * A probe is a startup-time data fetch. The result is exposed as
 * {{probe.NAME}} (Mustache) and { var: "probe.NAME" } (JSONLogic)
 * across the rest of the YAML.
 *
 * Probes reuse the existing handler types but only graphql / http /
 * exec are accepted (inline / compute / dispatch are nonsensical at
 * boot — see Plan 5 design doc).
 */
export type ProbeHandler = GraphqlHandler | HttpHandler | { exec: string | string[] };

export interface ProbeSpec {
  handler: ProbeHandler;
  /** Optional JSONLogic rule applied to the parsed-or-raw handler response. */
  map?: JsonLogicRule;
  /** Per-probe timeout in milliseconds. Default: 30000. */
  timeout_ms?: number;
}

export type ProbesConfig = Record<string, ProbeSpec>;

/**
 * Watcher types supported in v1. Polling re-invokes the handler on an
 * interval and compares content hashes; file uses fs.watch on a single
 * filesystem path. Webhook and glob paths are deferred — see Plan 6
 * design doc, "Out of scope".
 */
export type WatcherSpec =
  | {
      type: "polling";
      interval_ms: number;
      change_detection?: "hash" | "always";
    }
  | {
      type: "file";
      path: string;
    };

/**
 * Base fields shared by static-URI and URI-template resources. Handler
 * reuses the existing tool handler types; the resource read callback
 * invokes it and translates the ToolCallResult's first text content into
 * a ReadResourceResult.
 *
 * ResourceSpec is a discriminated union — a resource entry must carry
 * exactly one of uri: (static, Plan 6) or template: (RFC 6570, Plan 7).
 * Watcher is only valid on static resources; template+watcher is rejected
 * at parse time (watching a family-of-URIs is unbounded).
 */
interface ResourceSpecBase {
  name: string;
  description?: string;
  mimeType?: string;
  handler: Handler;
}

interface ResourceSpecStatic extends ResourceSpecBase {
  uri: string;
  template?: never;
  watcher?: WatcherSpec;
}

interface ResourceSpecTemplated extends ResourceSpecBase {
  template: string;
  uri?: never;
  watcher?: never;
}

export type ResourceSpec = ResourceSpecStatic | ResourceSpecTemplated;

export type ResourcesConfig = ResourceSpec[];

export interface PromptArgumentSpec {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptSpec {
  name: string;
  description?: string;
  arguments?: PromptArgumentSpec[];
  template: string;
}

export type PromptsConfig = PromptSpec[];

export interface CompletionsConfig {
  /** promptName -> argName -> value list */
  prompts?: Record<string, Record<string, string[]>>;
  /** templateString -> varName -> value list */
  resources?: Record<string, Record<string, string[]>>;
}

/**
 * One transition out of a state. Evaluated in declaration order; the first
 * matching transition fires. A transition with no `when:` always matches.
 *
 * `event:` is reserved for forward compatibility (future external triggers).
 * Plan 8 transitions all fire on action completion; `event:` is currently a
 * documentation-only field.
 */
export interface TransitionSpec {
  event?: string;
  target: string;
  when?: JsonLogicRule;
}

/**
 * One state in a workflow. Two shapes:
 *   - non-terminal (mcpStatus: "working") — declares actions: and on:;
 *     MUST NOT declare result:
 *   - terminal (mcpStatus: "completed" | "failed") — declares result:;
 *     MUST NOT declare actions: or on:
 *
 * The validator enforces the shape at parse time so the interpreter can
 * trust state.actions / state.on / state.result without re-checking.
 */
/**
 * One field in an elicitation form schema. Subset of the MCP SDK's
 * requestedSchema property types. The interpreter translates these
 * to the SDK's form-mode elicitation shape at runtime.
 */
export interface ElicitationFieldSpec {
  type: "string" | "boolean" | "number" | "integer" | "array";
  description?: string;
  title?: string;
  // string-specific
  enum?: string[];
  enumNames?: string[];
  oneOf?: Array<{ const: string; title: string }>;
  format?: "email" | "date" | "uri" | "date-time";
  minLength?: number;
  maxLength?: number;
  default?: unknown;
  // number/integer-specific
  minimum?: number;
  maximum?: number;
  // array-specific
  items?: { type: "string"; enum: string[] };
  minItems?: number;
  maxItems?: number;
}

/**
 * Elicitation block on an input_required state. Drives a form-mode
 * elicitation/create request to the client.
 */
export interface ElicitationSpec {
  message: string;
  required?: string[];
  schema: Record<string, ElicitationFieldSpec>;
}

export interface StateSpec {
  mcpStatus: "working" | "input_required" | "completed" | "failed";
  statusMessage?: string;
  elicitation?: ElicitationSpec;
  actions?: Handler[];
  on?: TransitionSpec[];
  result?: { text: string };
}

export interface WorkflowSpec {
  initial: string;
  states: Record<string, StateSpec>;
}

/** Top-level tasks: block — workflow definitions keyed by name. */
export type TasksConfig = Record<string, WorkflowSpec>;

/**
 * A workflow handler routes a tool call into a named state-machine
 * workflow declared in the top-level tasks: block. It is task-only —
 * the tool MUST also declare execution.taskSupport (Phase 6 enforces
 * the cross-ref). The plain invoke() path in handlers/index.ts rejects
 * workflow handlers with a clear error so accidental misuse fails loud.
 *
 * ttl_ms is the per-task lifetime hint passed to TaskStore.createTask.
 * Default: 300_000 (5 minutes), matching the SDK example.
 */
export interface WorkflowHandler {
  workflow: {
    ref: string;
    ttl_ms?: number;
  };
}

export type Handler =
  | InlineHandler
  | ExecHandler
  | DispatchHandler
  | ComputeHandler
  | HttpHandler
  | GraphqlHandler
  | WorkflowHandler;

export interface ToolDefinition {
  name: string;
  description: string;
  input?: Record<string, InputFieldSchema>;
  handler: Handler;
  transform?: JsonLogicRule;
  /** Task execution mode. When present, the tool registers via the SDK's
   * experimental.tasks.registerToolTask path instead of registerTool. */
  execution?: ExecutionConfig;
}

/**
 * A single upstream connection. URL and timeout are static (resolved at
 * boot). Headers may be static strings OR JSONLogic rules (the result
 * of ${VAR} shim expansion or an author-authored rule). Compilation to
 * cached rules happens in src/runtime/connections.ts at boot.
 */
export interface ConnectionDefinition {
  url: string;
  headers?: Record<string, string | JsonLogicRule>;
  timeout_ms?: number;
}

export type ConnectionsConfig = Record<string, ConnectionDefinition>;

export interface JigConfig {
  version: string;
  server: ServerMetadata;
  tools: ToolDefinition[];
  connections?: ConnectionsConfig;
  /** Startup-time data fetches; resolved before tool registration. */
  probes?: ProbesConfig;
  /** MCP resources — boot-registered content endpoints. */
  resources?: ResourcesConfig;
  /** MCP prompts — boot-registered named template prompts. */
  prompts?: PromptsConfig;
  /** Autocomplete value lists for prompt arguments and template variables. */
  completions?: CompletionsConfig;
  /** State-machine workflows referenced by workflow: handlers. */
  tasks?: TasksConfig;
}

const KNOWN_ROOT_KEYS = new Set([
  "version", "server", "tools", "connections", "probes",
  "resources", "prompts", "completions", "tasks",
]);

const CURRENT_VERSION = "1";

export function parseConfig(yamlText: string): JigConfig {
  const raw = parseYaml(yamlText) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("config: YAML root must be a mapping");
  }
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      throw new Error(`config: unknown root key "${key}"`);
    }
  }

  if (obj["version"] === undefined) {
    throw new Error(
      `config: version is required (current version is "${CURRENT_VERSION}")`,
    );
  }
  const version = String(obj["version"]);
  if (version !== CURRENT_VERSION) {
    throw new Error(
      `config: unsupported version "${version}" (this runtime supports version "${CURRENT_VERSION}")`,
    );
  }

  const server = validateServer(obj["server"]);
  const tools = validateTools(obj["tools"]);
  const connections = validateConnections(obj["connections"]);
  const probes = validateProbes(obj["probes"]);
  const resources = validateResources(obj["resources"], (h, owner) =>
    validateHandlerPublic(h, owner),
  );
  const prompts = validatePrompts(obj["prompts"]);
  const completions = validateCompletions(obj["completions"], prompts, resources);
  const tasks = validateTasks(obj["tasks"], (h, owner) => validateHandlerPublic(h, owner));

  const result: JigConfig = { version, server, tools };
  if (connections !== undefined) result.connections = connections;
  if (probes !== undefined) result.probes = probes;
  if (resources !== undefined) result.resources = resources;
  if (prompts !== undefined) result.prompts = prompts;
  if (completions !== undefined) result.completions = completions;
  if (tasks !== undefined) result.tasks = tasks;
  crossRefTasks(tools, tasks);
  return result;
}

/**
 * Walk a handler tree and yield every workflow.ref it contains.
 * Plan 8 supports two shapes:
 *   - outer handler is workflow: → one ref
 *   - outer handler is dispatch: → zero or more refs from cases[*].handler
 *     (recursively in case any future plan adds nested dispatch)
 *
 * Other handler types (inline/exec/compute/http/graphql) yield nothing.
 */
function* findWorkflowRefs(handler: Handler): Generator<{ ref: string; path: string }> {
  if ("workflow" in handler) {
    yield { ref: handler.workflow.ref, path: "handler.workflow" };
    return;
  }
  if ("dispatch" in handler) {
    for (const [caseName, caseSpec] of Object.entries(handler.dispatch.cases)) {
      for (const inner of findWorkflowRefs(caseSpec.handler)) {
        yield {
          ref: inner.ref,
          path: `handler.dispatch.cases.${caseName}.${inner.path}`,
        };
      }
    }
  }
  // inline/exec/compute/http/graphql: no workflow refs
}

/**
 * After all blocks are validated, enforce the cross-block invariants:
 *   - any tool containing a workflow ref (outer or nested in dispatch)
 *     requires execution.taskSupport
 *   - every workflow.ref must resolve to a declared task workflow
 *   - a task tool's outer handler must be workflow: or dispatch:
 */
function crossRefTasks(tools: ToolDefinition[], tasks: TasksConfig | undefined): void {
  for (const tool of tools) {
    const isTaskTool = tool.execution !== undefined;
    const refs = [...findWorkflowRefs(tool.handler)];
    const hasAnyWorkflowRef = refs.length > 0;

    // Rule: a tool that contains ANY workflow ref (outer OR nested in
    // dispatch) requires execution.taskSupport.
    if (hasAnyWorkflowRef && !isTaskTool) {
      const refList = refs.map((r) => r.path).join(", ");
      throw new Error(
        `config: tools[${tool.name}]: workflow case present (${refList}) requires execution.taskSupport (declare execution: { taskSupport: required } or remove the workflow case)`,
      );
    }

    // Rule: every workflow.ref must resolve.
    for (const { ref, path } of refs) {
      if (!tasks || !(ref in tasks)) {
        throw new Error(
          `config: tools[${tool.name}].${path}.ref "${ref}" not found in tasks:`,
        );
      }
    }

    // Rule: a task tool's outer handler must be either workflow: or
    // dispatch:. Other handler types (inline/exec/compute/http/graphql
    // at the OUTER level) cannot drive the task lifecycle in v1.
    if (isTaskTool) {
      const outerOk = "workflow" in tool.handler || "dispatch" in tool.handler;
      if (!outerOk) {
        throw new Error(
          `config: tools[${tool.name}]: task tool (execution.taskSupport set) requires the outer handler to be workflow: or dispatch: (got ${Object.keys(tool.handler)[0]})`,
        );
      }
    }
  }
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
  const knownKeys = new Set(["filesystem", "env", "network"]);
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

  if (sec["network"] !== undefined) {
    if (!sec["network"] || typeof sec["network"] !== "object") {
      throw new Error("config: security.network must be a mapping");
    }
    const net = sec["network"] as Record<string, unknown>;
    if (net["allow"] !== undefined) {
      if (!Array.isArray(net["allow"])) {
        throw new Error("config: security.network.allow must be an array of strings");
      }
      for (const entry of net["allow"]) {
        if (typeof entry !== "string" || entry.length === 0) {
          throw new Error("config: security.network.allow entries must be non-empty strings");
        }
      }
      result.network = { allow: net["allow"] as string[] };
    } else {
      result.network = {};
    }
  }

  return result;
}

function validateTools(v: unknown): ToolDefinition[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error("config: tools must be an array");
  }
  const seenNames = new Set<string>();
  return v.map((entry, i) => {
    const tool = validateTool(entry, i);
    if (seenNames.has(tool.name)) {
      throw new Error(`config: tools: duplicate tool name "${tool.name}"`);
    }
    seenNames.add(tool.name);
    return tool;
  });
}

const VALID_INPUT_TYPES = new Set([
  "string", "integer", "number", "boolean", "object", "array",
]);

const TOOL_KNOWN_KEYS = new Set([
  "name", "description", "input", "handler", "transform", "execution",
]);

function validateTool(entry: unknown, index: number): ToolDefinition {
  if (!entry || typeof entry !== "object") {
    throw new Error(`config: tools[${index}] must be a mapping`);
  }
  const t = entry as Record<string, unknown>;
  for (const key of Object.keys(t)) {
    if (!TOOL_KNOWN_KEYS.has(key)) {
      throw new Error(`config: tools[${index}]: unknown key "${key}"`);
    }
  }
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
  const transformRaw = t["transform"];
  const execution = validateExecution(t["execution"], t["name"]);
  const tool: ToolDefinition = {
    name: t["name"],
    description: t["description"],
    input: validateInput(t["input"], t["name"]),
    handler,
  };
  if (transformRaw !== undefined) {
    // No structural validation — any valid JSONLogic is accepted. Engine
    // errors at invocation time become isError tool results.
    tool.transform = transformRaw as JsonLogicRule;
  }
  if (execution !== undefined) {
    tool.execution = execution;
  }
  return tool;
}

function validateExecution(v: unknown, toolName: string): ExecutionConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].execution must be a mapping`);
  }
  const e = v as Record<string, unknown>;

  const known = new Set(["taskSupport"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(`config: tools[${toolName}].execution: unknown key "${key}"`);
    }
  }

  if (e["taskSupport"] === undefined) {
    throw new Error(`config: tools[${toolName}].execution.taskSupport is required`);
  }
  const ts = e["taskSupport"];
  if (ts !== "required" && ts !== "optional") {
    throw new Error(
      `config: tools[${toolName}].execution.taskSupport must be one of "required", "optional" (got ${JSON.stringify(ts)})`,
    );
  }

  return { taskSupport: ts };
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
    if (!VALID_INPUT_TYPES.has(s["type"])) {
      throw new Error(
        `config: tools[${toolName}].input.${field}.type must be one of ${[...VALID_INPUT_TYPES].join(", ")} (got "${s["type"]}")`,
      );
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

  if (Array.isArray(h["exec"])) {
    const arr = h["exec"] as unknown[];
    if (arr.length === 0) {
      throw new Error(
        `config: tools[${toolName}].handler.exec array must not be empty`,
      );
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== "string") {
        throw new Error(
          `config: tools[${toolName}].handler.exec[${i}] must be a string`,
        );
      }
    }
    return { exec: arr as string[] };
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

  if (h["http"] && typeof h["http"] === "object") {
    return validateHttp(h["http"], toolName);
  }

  if (h["graphql"] && typeof h["graphql"] === "object") {
    return validateGraphql(h["graphql"], toolName);
  }

  if (h["workflow"] && typeof h["workflow"] === "object") {
    return validateWorkflowHandler(h["workflow"], toolName);
  }

  throw new Error(
    `config: tools[${toolName}].handler has no supported handler type (inline, exec, dispatch, compute, http, graphql, workflow)`,
  );
}

/**
 * Public wrapper over validateHandler so sibling modules (resources.ts)
 * can delegate handler validation under their own owner labels
 * ("resources[0]" etc.) without duplicating the handler-type dispatch.
 */
export function validateHandlerPublic(h: unknown, ownerLabel: string): Handler {
  return validateHandler(h, ownerLabel);
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
    const when = e["when"];
    // when: is arbitrary JSONLogic — no structural validation at parse
    // time. Engine errors at evaluation time become isError tool results.
    const whenValue: JsonLogicRule | undefined = when === undefined ? undefined : when;
    const caseValue: DispatchCase = { handler: subHandler };
    if (requiresValue !== undefined) caseValue.requires = requiresValue;
    if (whenValue !== undefined) caseValue.when = whenValue;
    cases[name] = caseValue;
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

function validateHttp(v: unknown, toolName: string): HttpHandler {
  const h = v as Record<string, unknown>;
  const method = h["method"];
  const validMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  if (typeof method !== "string" || !validMethods.has(method)) {
    throw new Error(
      `config: tools[${toolName}].handler.http.method must be one of GET, POST, PUT, PATCH, DELETE`,
    );
  }
  const connection = h["connection"];
  const url = h["url"];
  if (connection === undefined && url === undefined) {
    throw new Error(
      `config: tools[${toolName}].handler.http requires either connection or url`,
    );
  }
  if (connection !== undefined && typeof connection !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.connection must be a string`);
  }
  if (url !== undefined && typeof url !== "string") {
    throw new Error(`config: tools[${toolName}].handler.http.url must be a string`);
  }

  const out: HttpHandler = { http: { method: method as HttpMethod } };
  if (connection !== undefined) out.http.connection = connection as string;
  if (url !== undefined) out.http.url = url as string;

  for (const key of ["path", "body"]) {
    if (h[key] !== undefined) (out.http as Record<string, unknown>)[key] = h[key];
  }

  if (h["query"] !== undefined) {
    if (!h["query"] || typeof h["query"] !== "object" || Array.isArray(h["query"])) {
      throw new Error(`config: tools[${toolName}].handler.http.query must be a mapping`);
    }
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(h["query"])) {
      if (typeof v !== "string") {
        throw new Error(
          `config: tools[${toolName}].handler.http.query.${k} must be a string`,
        );
      }
      q[k] = v;
    }
    out.http.query = q;
  }

  if (h["headers"] !== undefined) {
    if (!h["headers"] || typeof h["headers"] !== "object" || Array.isArray(h["headers"])) {
      throw new Error(`config: tools[${toolName}].handler.http.headers must be a mapping`);
    }
    const hdrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(h["headers"])) {
      if (typeof v !== "string") {
        throw new Error(`config: tools[${toolName}].handler.http.headers.${k} must be a string`);
      }
      hdrs[k] = v;
    }
    out.http.headers = hdrs;
  }

  if (h["response"] !== undefined) {
    if (h["response"] !== "body" && h["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.http.response must be "body" or "envelope"`,
      );
    }
    out.http.response = h["response"] as "body" | "envelope";
  }

  if (h["timeout_ms"] !== undefined) {
    if (typeof h["timeout_ms"] !== "number" || !Number.isFinite(h["timeout_ms"]) || h["timeout_ms"] <= 0) {
      throw new Error(`config: tools[${toolName}].handler.http.timeout_ms must be a positive number`);
    }
    out.http.timeout_ms = h["timeout_ms"];
  }

  const known = new Set([
    "method", "connection", "url", "path", "query",
    "headers", "body", "response", "timeout_ms",
  ]);
  for (const key of Object.keys(h)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.http: unknown key "${key}"`,
      );
    }
  }

  return out;
}

function validateConnections(v: unknown): ConnectionsConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: connections must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: ConnectionsConfig = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: connections.${name} must be a mapping`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e["url"] !== "string" || e["url"].length === 0) {
      throw new Error(`config: connections.${name}.url must be a non-empty string`);
    }
    const url = e["url"];
    const def: ConnectionDefinition = { url };

    if (e["headers"] !== undefined) {
      if (!e["headers"] || typeof e["headers"] !== "object" || Array.isArray(e["headers"])) {
        throw new Error(`config: connections.${name}.headers must be a mapping`);
      }
      // Apply ${VAR} shim to every string value in headers.
      const expanded = expandShimInTree(e["headers"]) as Record<string, unknown>;
      def.headers = expanded as Record<string, string | JsonLogicRule>;
    }

    if (e["timeout_ms"] !== undefined) {
      if (typeof e["timeout_ms"] !== "number" || !Number.isFinite(e["timeout_ms"]) || e["timeout_ms"] <= 0) {
        throw new Error(`config: connections.${name}.timeout_ms must be a positive number`);
      }
      def.timeout_ms = e["timeout_ms"];
    }

    // Reject unknown keys so typos fail loud.
    const known = new Set(["url", "headers", "timeout_ms"]);
    for (const key of Object.keys(e)) {
      if (!known.has(key)) {
        throw new Error(`config: connections.${name}: unknown key "${key}"`);
      }
    }

    out[name] = def;
  }
  return out;
}

function validateGraphql(v: unknown, toolName: string): GraphqlHandler {
  const g = v as Record<string, unknown>;
  if (typeof g["connection"] !== "string" || g["connection"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.connection must be a non-empty string`,
    );
  }
  if (typeof g["query"] !== "string" || g["query"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.graphql.query must be a non-empty string`,
    );
  }
  const out: GraphqlHandler = {
    graphql: { connection: g["connection"], query: g["query"] },
  };
  if (g["variables"] !== undefined) out.graphql.variables = g["variables"];
  if (g["response"] !== undefined) {
    if (g["response"] !== "data" && g["response"] !== "envelope") {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.response must be "data" or "envelope"`,
      );
    }
    out.graphql.response = g["response"] as "data" | "envelope";
  }
  if (g["timeout_ms"] !== undefined) {
    if (typeof g["timeout_ms"] !== "number" || !Number.isFinite(g["timeout_ms"]) || g["timeout_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.graphql.timeout_ms must be a positive number`,
      );
    }
    out.graphql.timeout_ms = g["timeout_ms"];
  }

  const known = new Set([
    "connection", "query", "variables", "response", "timeout_ms",
  ]);
  for (const key of Object.keys(g)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.graphql: unknown key "${key}"`,
      );
    }
  }

  return out;
}

function validateWorkflowHandler(v: unknown, toolName: string): WorkflowHandler {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: tools[${toolName}].handler.workflow must be a mapping`);
  }
  const w = v as Record<string, unknown>;

  const known = new Set(["ref", "ttl_ms"]);
  for (const key of Object.keys(w)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow: unknown key "${key}"`,
      );
    }
  }

  if (typeof w["ref"] !== "string" || w["ref"].length === 0) {
    throw new Error(
      `config: tools[${toolName}].handler.workflow.ref is required and must be a non-empty string`,
    );
  }
  const out: WorkflowHandler = { workflow: { ref: w["ref"] } };
  if (w["ttl_ms"] !== undefined) {
    if (typeof w["ttl_ms"] !== "number" || !Number.isFinite(w["ttl_ms"]) || w["ttl_ms"] <= 0) {
      throw new Error(
        `config: tools[${toolName}].handler.workflow.ttl_ms must be a positive number`,
      );
    }
    out.workflow.ttl_ms = w["ttl_ms"];
  }
  return out;
}
