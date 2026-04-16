import type {
  Handler,
  StateSpec,
  TasksConfig,
  TransitionSpec,
  WorkflowSpec,
} from "./config.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";

const STATE_KNOWN = new Set([
  "mcpStatus",
  "statusMessage",
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
 *   - each state: mcpStatus (required, one of "working" | "completed" |
 *     "failed"), statusMessage (optional), actions (optional Handler[]),
 *     on (optional TransitionSpec[]), result (optional { text })
 *   - terminal states (mcpStatus: completed | failed) MUST declare result
 *     and MUST NOT declare actions or on
 *   - non-terminal states (mcpStatus: working) MUST declare on and MUST
 *     NOT declare result; actions is optional but typical
 *   - transitions: target (required, must reference a declared state),
 *     event (optional string, reserved for forward compat), when (optional
 *     JSONLogic, no structural validation)
 *   - mcpStatus: input_required → rejected with "Plan 9"
 *   - mcpStatus: cancelled → rejected with "client-initiated"
 *   - elicitation: key on state → rejected with "Plan 9"
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

  // Reject the Plan-9 elicitation: key explicitly so the error names the plan.
  if ("elicitation" in s) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: elicitation: blocks land in Plan 9 (input_required + elicitation/create round-trip). Remove the elicitation: key.`,
    );
  }

  for (const key of Object.keys(s)) {
    if (!STATE_KNOWN.has(key)) {
      throw new Error(
        `config: tasks.${workflowName}.states.${stateName}: unknown key "${key}"`,
      );
    }
  }

  const mcpStatusRaw = s["mcpStatus"];
  if (mcpStatusRaw === "input_required") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "input_required" lands in Plan 9 (elicitation). Use working/completed/failed in Plan 8.`,
    );
  }
  if (mcpStatusRaw === "cancelled") {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}: mcpStatus "cancelled" is client-initiated only — set by the SDK when tasks/cancel is called. Authors cannot declare it as a terminal state.`,
    );
  }
  if (
    mcpStatusRaw !== "working" &&
    mcpStatusRaw !== "completed" &&
    mcpStatusRaw !== "failed"
  ) {
    throw new Error(
      `config: tasks.${workflowName}.states.${stateName}.mcpStatus must be one of "working", "completed", "failed" (got ${JSON.stringify(mcpStatusRaw)})`,
    );
  }
  const mcpStatus = mcpStatusRaw as "working" | "completed" | "failed";

  const isTerminal = mcpStatus === "completed" || mcpStatus === "failed";

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
  } else {
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
