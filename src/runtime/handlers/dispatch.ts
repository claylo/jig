import type { DispatchHandler, Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { evaluate } from "../util/jsonlogic.ts";

/**
 * The invoke function type `dispatch` accepts as a parameter. Keeps this
 * module acyclic — dispatch calls back into the central invoke without
 * importing it directly.
 */
export type InvokeFn = (
  handler: Handler,
  args: Record<string, unknown>,
) => Promise<ToolCallResult>;

/**
 * Route a tool call through a dispatcher spec.
 *
 * Reads the discriminator named by `dispatch.on` from args, looks up the
 * matching case, checks per-action `requires:`, then calls `invoke` with
 * the case's sub-handler and the same args. Args pass through unchanged
 * so the sub-handler sees everything the tool was called with.
 *
 * All validation failures — missing discriminator, unknown action,
 * missing required fields — return isError tool results with
 * field-named messages. Clients see these as normal tool output they
 * can display; they are not JSON-RPC protocol errors.
 */
export async function invokeDispatch(
  handler: DispatchHandler,
  args: Record<string, unknown>,
  invoke: InvokeFn,
  probe: Record<string, unknown>,
): Promise<ToolCallResult> {
  const { on, cases } = handler.dispatch;
  const actionValue = args[on];

  if (typeof actionValue !== "string" || actionValue.length === 0) {
    return errorResult(`dispatch: field "${on}" is required`);
  }

  const matched = cases[actionValue];
  if (!matched) {
    const known = Object.keys(cases).join(", ");
    return errorResult(
      `dispatch: unknown action "${actionValue}". Known actions: ${known}`,
    );
  }

  if (matched.when !== undefined) {
    let guardPassed: boolean;
    try {
      const raw = await evaluate(matched.when, { ...args, probe });
      guardPassed = Boolean(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(
        `dispatch: guard for action "${actionValue}" errored: ${message}`,
      );
    }
    if (!guardPassed) {
      return errorResult(
        `dispatch: guard for action "${actionValue}" did not pass`,
      );
    }
  }

  if (matched.requires) {
    const missing = matched.requires.filter((field) => {
      const v = args[field];
      return v === undefined || v === null || v === "";
    });
    if (missing.length > 0) {
      const fields = missing.join(", ");
      return errorResult(
        `dispatch: field(s) "${fields}" required for action "${actionValue}"`,
      );
    }
  }

  return invoke(matched.handler, args);
}

function errorResult(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
