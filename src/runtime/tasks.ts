import type {
  Handler,
  ElicitationFieldSpec,
  ElicitationSpec,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
import type { CallToolResult } from "./server.ts";
import type { InvokeContext, ToolCallResult } from "./handlers/types.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";
import { evaluate as evalJsonLogic } from "./util/jsonlogic.ts";
import { render } from "./util/template.ts";

const STATE_KNOWN = new Set([
  "mcpStatus",
  "statusMessage",
  "elicitation",
  "actions",
  "on",
  "result",
]);

const TRANSITION_KNOWN = new Set(["event", "target", "when"]);

const WORKFLOW_KNOWN = new Set(["initial", "states"]);

/**
 * Validate the top-level `tasks:` block.
 *
 * Rules:
 *   - tasks is undefined OR a mapping of workflowName -> WorkflowSpec
 *   - each workflow: initial (required, must reference a declared state),
 *     states (required, mapping of stateName -> StateSpec)
 *   - each state: mcpStatus (required, one of "working" |
 *     "input_required" | "completed" | "failed"), statusMessage
 *     (optional), actions (optional Handler[]), on (optional
 *     TransitionSpec[]), result (optional { text })
 *   - terminal states (mcpStatus: completed | failed) MUST declare result
 *     and MUST NOT declare actions or on
 *   - working states MUST declare on and MUST NOT declare result;
 *     actions is optional but typical
 *   - input_required states MUST declare elicitation and on, and MUST NOT
 *     declare actions or result
 *   - transitions: target (required, must reference a declared state),
 *     event (optional string, reserved for forward compat), when (optional
 *     JSONLogic, no structural validation)
 *   - mcpStatus: cancelled → rejected with "client-initiated"
 *   - unknown keys rejected at workflow, state, and transition levels
 *
 * `validateHandler` is passed in by the caller (config.ts) to avoid
 * importing from config.ts itself (would be circular). Each action's
 * handler is delegated to that validator under the owner label
 * `tasks.<workflow>.states.<state>.actions[i]`.
 */
export function validateTasks(
  v: unknown,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): TasksConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: tasks must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: TasksConfig = {};
  for (const [workflowName, workflowEntry] of Object.entries(raw)) {
    out[workflowName] = validateWorkflow(workflowEntry, workflowName, validateHandler);
  }
  return out;
}

function validateWorkflow(
  entry: unknown,
  name: string,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): WorkflowSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${name} must be a mapping`);
  }
  const w = entry as Record<string, unknown>;

  for (const key of Object.keys(w)) {
    if (!WORKFLOW_KNOWN.has(key)) {
      throw new Error(`config: tasks.${name}: unknown key "${key}"`);
    }
  }

  if (typeof w["initial"] !== "string" || w["initial"].length === 0) {
    throw new Error(`config: tasks.${name}.initial is required and must be a non-empty string`);
  }
  const initial = w["initial"];

  if (!w["states"] || typeof w["states"] !== "object" || Array.isArray(w["states"])) {
    throw new Error(`config: tasks.${name}.states is required and must be a mapping`);
  }
  const rawStates = w["states"] as Record<string, unknown>;

  // First pass: collect state names so transition target checks can run.
  const stateNames = new Set(Object.keys(rawStates));

  if (!stateNames.has(initial)) {
    throw new Error(
      `config: tasks.${name}.initial "${initial}" is not a declared state`,
    );
  }

  // Second pass: validate each state with the state-name set in hand.
  const states: Record<string, StateSpec> = {};
  for (const [stateName, stateEntry] of Object.entries(rawStates)) {
    states[stateName] = validateState(
      stateEntry,
      name,
      stateName,
      stateNames,
      validateHandler,
    );
  }

  return { initial, states };
}

function validateState(
  entry: unknown,
  workflowName: string,
  stateName: string,
  declaredStateNames: Set<string>,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): StateSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: tasks.${workflowName}.states.${stateName} must be a mapping`);
  }
  const s = entry as Record<string, unknown>;

  for (const key of Object.keys(s)) {
    if (!STATE_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: unknown key "${key}"`,
      );
    }
  }

  const mcpStatusRaw = s["mcpStatus"];
  if (mcpStatusRaw === "cancelled") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "cancelled" is client-initiated only — set by the SDK when tasks/cancel is called. Authors cannot declare it as a terminal state.`,
    );
  }
  if (
    mcpStatusRaw !== "working" &&
    mcpStatusRaw !== "input_required" &&
    mcpStatusRaw !== "completed" &&
    mcpStatusRaw !== "failed"
  ) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.mcpStatus must be one of "working", "input_required", "completed", "failed" (got ${JSON.stringify(mcpStatusRaw)})`,
    );
  }
  const mcpStatus = mcpStatusRaw as "working" | "input_required" | "completed" | "failed";

  const isTerminal = mcpStatus === "completed" || mcpStatus === "failed";
  const isInputRequired = mcpStatus === "input_required";

  // elicitation: is only valid on input_required states.
  if (!isInputRequired && s["elicitation"] !== undefined) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: is only valid on input_required states (this state has mcpStatus: ${mcpStatus})`,
    );
  }

  // Shape constraints.
  if (isTerminal) {
    if (!s["result"] || typeof s["result"] !== "object") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state (mcpStatus: ${mcpStatus}) requires a result: { text } block`,
      );
    }
    if (s["actions"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare actions:`,
      );
    }
    if (s["on"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: terminal state MUST NOT declare on:`,
      );
    }
  } else if (isInputRequired) {
    if (s["elicitation"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an elicitation: block`,
      );
    }
    if (s["actions"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare actions: (pre-elicitation work belongs in the prior state)`,
      );
    }
    if (s["result"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state MUST NOT declare result: (it is not terminal)`,
      );
    }
    if (s["on"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: input_required state requires an on: array (transitions after elicitation response)`,
      );
    }
  } else {
    // mcpStatus: working
    if (s["result"] !== undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state (mcpStatus: working) MUST NOT declare result:`,
      );
    }
    if (s["on"] === undefined) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: non-terminal state requires an on: array (otherwise the workflow never advances)`,
      );
    }
  }

  // Field validation.
  const out: StateSpec = { mcpStatus };

  if (s["statusMessage"] !== undefined) {
    if (typeof s["statusMessage"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.statusMessage must be a string`,
      );
    }
    out.statusMessage = s["statusMessage"];
  }

  if (s["elicitation"] !== undefined) {
    out.elicitation = validateElicitation(s["elicitation"], workflowName, stateName);
  }

  if (s["actions"] !== undefined) {
    if (!Array.isArray(s["actions"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.actions must be an array`,
      );
    }
    const actions: Handler[] = [];
    for (let i = 0; i < s["actions"].length; i++) {
      actions.push(
        validateHandler(
          s["actions"][i],
          `tasks.${workflowName}.states.${stateName}.actions[${i}]`,
        ),
      );
    }
    out.actions = actions;
  }

  if (s["on"] !== undefined) {
    if (!Array.isArray(s["on"])) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on must be an array`,
      );
    }
    const transitions: TransitionSpec[] = [];
    for (let i = 0; i < s["on"].length; i++) {
      transitions.push(
        validateTransition(
          s["on"][i],
          workflowName,
          stateName,
          i,
          declaredStateNames,
        ),
      );
    }
    out.on = transitions;
  }

  if (s["result"] !== undefined) {
    const r = s["result"] as Record<string, unknown>;
    if (typeof r["text"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.result.text must be a string`,
      );
    }
    // Reject unknown keys on result so future structured-content shapes
    // surface as parse errors instead of silently ignored.
    for (const key of Object.keys(r)) {
      if (key !== "text") {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.result: unknown key "${key}" (only "text" is supported in v1)`,
        );
      }
    }
    out.result = { text: r["text"] };
  }

  return out;
}

function validateElicitation(
  entry: unknown,
  workflowName: string,
  stateName: string,
): ElicitationSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation must be a mapping`,
    );
  }
  const e = entry as Record<string, unknown>;

  const known = new Set(["message", "schema", "required"]);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation: unknown key "${key}"`,
      );
    }
  }

  if (typeof e["message"] !== "string" || e["message"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.message is required and must be a non-empty string`,
    );
  }

  if (!e["schema"] || typeof e["schema"] !== "object" || Array.isArray(e["schema"])) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema is required and must be a mapping`,
    );
  }
  const rawSchema = e["schema"] as Record<string, unknown>;
  if (Object.keys(rawSchema).length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema must declare at least one field`,
    );
  }

  const schema: Record<string, ElicitationFieldSpec> = {};
  for (const [fieldName, fieldEntry] of Object.entries(rawSchema)) {
    schema[fieldName] = validateElicitationField(
      fieldEntry, workflowName, stateName, fieldName,
    );
  }

  const out: ElicitationSpec = { message: e["message"], schema };

  if (e["required"] !== undefined) {
    if (!Array.isArray(e["required"]) || !e["required"].every((r: unknown) => typeof r === "string")) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.elicitation.required must be an array of strings`,
      );
    }
    for (const req of e["required"] as string[]) {
      if (!(req in schema)) {
        throw new Error(
          `config: tasks.${workflowName}.states.${stateName}.elicitation.required lists "${req}" but it is not in schema`,
        );
      }
    }
    out.required = e["required"] as string[];
  }

  return out;
}

const ELICITATION_FIELD_TYPES = new Set(["string", "boolean", "number", "integer", "array"]);

function validateElicitationField(
  entry: unknown,
  workflowName: string,
  stateName: string,
  fieldName: string,
): ElicitationFieldSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName} must be a mapping`,
    );
  }
  const f = entry as Record<string, unknown>;

  if (!ELICITATION_FIELD_TYPES.has(f["type"] as string)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.elicitation.schema.${fieldName}.type must be one of "string", "boolean", "number", "integer", "array" (got ${JSON.stringify(f["type"])})`,
    );
  }

  const out: ElicitationFieldSpec = { type: f["type"] as ElicitationFieldSpec["type"] };
  if (typeof f["description"] === "string") out.description = f["description"];
  if (typeof f["title"] === "string") out.title = f["title"];
  if (f["default"] !== undefined) out.default = f["default"];
  if (Array.isArray(f["enum"])) out.enum = f["enum"] as string[];
  if (Array.isArray(f["enumNames"])) out.enumNames = f["enumNames"] as string[];
  if (Array.isArray(f["oneOf"])) out.oneOf = f["oneOf"] as Array<{ const: string; title: string }>;
  if (typeof f["format"] === "string") out.format = f["format"] as ElicitationFieldSpec["format"];
  if (typeof f["minLength"] === "number") out.minLength = f["minLength"];
  if (typeof f["maxLength"] === "number") out.maxLength = f["maxLength"];
  if (typeof f["minimum"] === "number") out.minimum = f["minimum"];
  if (typeof f["maximum"] === "number") out.maximum = f["maximum"];
  if (f["items"] !== undefined && typeof f["items"] === "object") out.items = f["items"] as { type: "string"; enum: string[] };
  if (typeof f["minItems"] === "number") out.minItems = f["minItems"];
  if (typeof f["maxItems"] === "number") out.maxItems = f["maxItems"];

  return out;
}

function validateTransition(
  entry: unknown,
  workflowName: string,
  stateName: string,
  index: number,
  declaredStateNames: Set<string>,
): TransitionSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}] must be a mapping`,
    );
  }
  const t = entry as Record<string, unknown>;

  for (const key of Object.keys(t)) {
    if (!TRANSITION_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}]: unknown key "${key}"`,
      );
    }
  }

  if (typeof t["target"] !== "string" || t["target"].length === 0) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target is required and must be a non-empty string`,
    );
  }
  const target = t["target"];
  if (!declaredStateNames.has(target)) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.on[${index}].target "${target}" is not a declared state`,
    );
  }

  const out: TransitionSpec = { target };
  if (t["event"] !== undefined) {
    if (typeof t["event"] !== "string") {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}.on[${index}].event must be a string`,
      );
    }
    out.event = t["event"];
  }
  if (t["when"] !== undefined) {
    out.when = t["when"] as JsonLogicRule;
  }
  return out;
}

// ─── Interpreter ──────────────────────────────────────────────────────

export interface InterpreterTaskStore {
  storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: CallToolResult,
  ): Promise<void>;
  updateTaskStatus(
    taskId: string,
    status: "working" | "input_required" | "completed" | "failed",
    statusMessage?: string,
  ): Promise<void>;
}

export interface ElicitParams {
  message: string;
  requestedSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ElicitResponse {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}

export interface InterpretWorkflowOptions {
  workflow: WorkflowSpec;
  args: Record<string, unknown>;
  ctx: InvokeContext;
  store: InterpreterTaskStore;
  taskId: string;
  invoke: (
    handler: Handler,
    args: Record<string, unknown>,
    ctx: InvokeContext,
  ) => Promise<ToolCallResult>;
  elicit: (params: ElicitParams) => Promise<ElicitResponse>;
}

interface WorkflowCtx {
  [key: string]: unknown;
  input: Record<string, unknown>;
  result: unknown;
  probe: Record<string, unknown>;
  elicitation: Record<string, unknown>;
}

type StepOutcome =
  | { kind: "advance"; target: string }
  | { kind: "terminal" }
  | { kind: "failed"; message: string };

const MAX_STEPS = 1024;

// ─── Top-level orchestrator ──────────────────────────────────────────

export async function interpretWorkflow(
  opts: InterpretWorkflowOptions,
): Promise<void> {
  const { workflow, args, ctx, store, taskId } = opts;

  const wCtx: WorkflowCtx = {
    input: args,
    result: undefined,
    probe: ctx.probe,
    elicitation: {},
  };

  let current = workflow.initial;

  for (let step = 0; step < MAX_STEPS; step++) {
    const state = workflow.states[current];
    if (!state) {
      await fail(store, taskId,
        `interpreter: state "${current}" not declared (this is a jig bug — should have been caught at parse time)`);
      return;
    }

    emitStatus(store, taskId, state);

    const outcome = await executeState(state, current, wCtx, opts);

    switch (outcome.kind) {
      case "terminal":
        return;
      case "failed":
        await fail(store, taskId, outcome.message);
        return;
      case "advance":
        current = outcome.target;
        break;
    }
  }

  await fail(store, taskId,
    `interpreter: max steps (${MAX_STEPS}) exceeded — likely a transition loop`);
}

// ─── Per-state dispatch ──────────────────────────────────────────────

async function executeState(
  state: StateSpec,
  stateName: string,
  wCtx: WorkflowCtx,
  opts: InterpretWorkflowOptions,
): Promise<StepOutcome> {

  if (state.mcpStatus === "input_required" && state.elicitation !== undefined) {
    const result = await runElicitation(state.elicitation, stateName, wCtx, opts);
    if (result.kind !== "advance") return result;
  }

  if (state.actions !== undefined) {
    const result = await runActions(state.actions, stateName, wCtx, opts);
    if (result.kind !== "advance") return result;
  }

  if (state.result !== undefined) {
    await renderTerminal(state, wCtx, opts);
    return { kind: "terminal" };
  }

  return resolveTransition(state, stateName, wCtx);
}

// ─── Elicitation ─────────────────────────────────────────────────────

async function runElicitation(
  spec: ElicitationSpec,
  stateName: string,
  wCtx: WorkflowCtx,
  opts: InterpretWorkflowOptions,
): Promise<StepOutcome> {
  let response: ElicitResponse;
  try {
    response = await opts.elicit({
      message: spec.message,
      requestedSchema: buildRequestedSchema(spec),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "failed", message: `elicitation failed in state "${stateName}": ${msg}` };
  }

  wCtx.elicitation = {
    action: response.action,
    ...(response.content ?? {}),
  };

  // Signal "continue to transitions" — not a real state advance.
  return { kind: "advance", target: "" };
}

// ─── Action execution ────────────────────────────────────────────────

async function runActions(
  actions: Handler[],
  stateName: string,
  wCtx: WorkflowCtx,
  opts: InterpretWorkflowOptions,
): Promise<StepOutcome> {
  let last: ToolCallResult | undefined;

  for (let i = 0; i < actions.length; i++) {
    let result: ToolCallResult;
    try {
      result = await opts.invoke(actions[i]!, opts.args, opts.ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "failed", message: `action ${i} (state "${stateName}") threw: ${msg}` };
    }
    if (result.isError) {
      const text = result.content[0]?.text ?? "<no error text>";
      return { kind: "failed", message: `action ${i} (state "${stateName}") failed: ${text}` };
    }
    last = result;
  }

  if (last !== undefined) {
    wCtx.result = parseActionResult(last);
  }

  return { kind: "advance", target: "" };
}

// ─── Terminal rendering ──────────────────────────────────────────────

async function renderTerminal(
  state: StateSpec,
  wCtx: WorkflowCtx,
  opts: InterpretWorkflowOptions,
): Promise<void> {
  const rendered = render(state.result!.text, wCtx);
  const status: "completed" | "failed" =
    state.mcpStatus === "failed" ? "failed" : "completed";
  const result: CallToolResult = {
    content: [{ type: "text", text: rendered }],
    ...(status === "failed" && { isError: true }),
  };
  await opts.store.storeTaskResult(opts.taskId, status, result);
}

// ─── Transition resolution ───────────────────────────────────────────

async function resolveTransition(
  state: StateSpec,
  stateName: string,
  wCtx: WorkflowCtx,
): Promise<StepOutcome> {
  if (state.on === undefined || state.on.length === 0) {
    return {
      kind: "failed",
      message: `interpreter: state "${stateName}" is non-terminal but has no on: transitions`,
    };
  }

  let firstGuardError: string | undefined;

  for (const t of state.on) {
    if (t.when === undefined) return { kind: "advance", target: t.target };

    let matched: unknown;
    try {
      matched = await evalJsonLogic(t.when as JsonLogicRule, wCtx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`jig: when: guard error (skipping transition to "${t.target}"): ${msg}\n`);
      firstGuardError ??= `guard for transition to "${t.target}" threw: ${msg}`;
      continue;
    }

    if (matched) return { kind: "advance", target: t.target };
  }

  const reason = firstGuardError
    ? `guard error in state "${stateName}": ${firstGuardError}`
    : `no transition matched in state "${stateName}" — workflow stalled`;
  return { kind: "failed", message: `interpreter: ${reason}` };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function emitStatus(
  store: InterpreterTaskStore,
  taskId: string,
  state: StateSpec,
): void {
  void store
    .updateTaskStatus(taskId, state.mcpStatus, state.statusMessage)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`jig: status update failed for task ${taskId}: ${msg}\n`);
    });
}

function buildRequestedSchema(
  spec: ElicitationSpec,
): ElicitParams["requestedSchema"] {
  const properties: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec.schema)) {
    const prop: Record<string, unknown> = { type: field.type };
    prop.title = field.title ?? name.charAt(0).toUpperCase() + name.slice(1);
    if (field.description !== undefined) prop.description = field.description;
    if (field.default !== undefined) prop.default = field.default;
    if (field.enum !== undefined) prop.enum = field.enum;
    if (field.enumNames !== undefined) prop.enumNames = field.enumNames;
    if (field.oneOf !== undefined) prop.oneOf = field.oneOf;
    if (field.format !== undefined) prop.format = field.format;
    if (field.minLength !== undefined) prop.minLength = field.minLength;
    if (field.maxLength !== undefined) prop.maxLength = field.maxLength;
    if (field.minimum !== undefined) prop.minimum = field.minimum;
    if (field.maximum !== undefined) prop.maximum = field.maximum;
    if (field.items !== undefined) prop.items = field.items;
    if (field.minItems !== undefined) prop.minItems = field.minItems;
    if (field.maxItems !== undefined) prop.maxItems = field.maxItems;
    properties[name] = prop;
  }
  const schema: ElicitParams["requestedSchema"] = {
    type: "object",
    properties,
  };
  if (spec.required !== undefined) schema.required = spec.required;
  return schema;
}

function parseActionResult(result: ToolCallResult): unknown {
  const text = result.content[0]?.text;
  if (text === undefined || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fail(
  store: InterpreterTaskStore,
  taskId: string,
  message: string,
): Promise<void> {
  try {
    await store.storeTaskResult(taskId, "failed", {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  } catch (err: unknown) {
    const storeErr = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `jig: task ${taskId} failed ("${message}") and the store rejected the result: ${storeErr}\n`,
    );
  }
}
