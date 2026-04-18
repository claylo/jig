import type { DispatchCase, DispatchHandler, Handler } from "../config.ts";
import { errorResult, type ToolCallResult } from "./types.ts";
import { evaluate } from "../util/jsonlogic.ts";

/** Result of resolving a dispatch handler against runtime args. */
export type ResolveDispatchResult =
  | { matched: true; caseName: string; case: DispatchCase }
  | { matched: false; reason: string };

/**
 * Find the matching dispatch case for an incoming args object. Mirrors
 * the case-matching semantics of invokeDispatch (discriminator lookup,
 * requires validation) but does NOT invoke the matched case's handler
 * or evaluate `when:` guards — leaves both to the caller.
 *
 * Used by:
 *   - invokeDispatch (synchronous tool path) — evaluates when:, then invokes
 *   - boot integration (dispatcher-task fusion, Phase 7) — branches on
 *     the matched case's handler type: workflow → interpreter,
 *     non-workflow → invoke + storeTaskResult as one-step synthetic task
 */
export function resolveDispatchCase(
  handler: DispatchHandler,
  args: Record<string, unknown>,
): ResolveDispatchResult {
  const { on, cases } = handler.dispatch;
  const actionValue = args[on];

  if (typeof actionValue !== "string" || actionValue.length === 0) {
    return {
      matched: false,
      reason: `dispatch: field "${on}" is required`,
    };
  }

  const matched = cases[actionValue];
  if (!matched) {
    const known = Object.keys(cases).join(", ");
    return {
      matched: false,
      reason: `dispatch: unknown action "${actionValue}". Known actions: ${known}`,
    };
  }

  if (matched.requires) {
    const missing = matched.requires.filter((field) => {
      const v = args[field];
      return v === undefined || v === null || v === "";
    });
    if (missing.length > 0) {
      const fields = missing.join(", ");
      return {
        matched: false,
        reason: `dispatch: field(s) "${fields}" required for action "${actionValue}"`,
      };
    }
  }

  return { matched: true, caseName: actionValue, case: matched };
}

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
  const resolved = resolveDispatchCase(handler, args);
  if (!resolved.matched) {
    return errorResult(resolved.reason);
  }

  const matched = resolved.case;

  // when: guard evaluation stays in the synchronous invoke path — the
  // task-tool fusion path (Phase 7) does NOT evaluate when: on cases.
  if (matched.when !== undefined) {
    let guardPassed: boolean;
    try {
      const raw = await evaluate(matched.when, { ...args, probe });
      guardPassed = Boolean(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(
        `dispatch: guard for action "${resolved.caseName}" errored: ${message}`,
      );
    }
    if (!guardPassed) {
      return errorResult(
        `dispatch: guard for action "${resolved.caseName}" did not pass`,
      );
    }
  }

  return invoke(matched.handler, args);
}
