import type { Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";

/**
 * Route a resolved Handler to the matching handler implementation.
 *
 * The function passed down to `invokeDispatch` is `invoke` itself, which
 * is what lets a dispatcher's sub-handler be another dispatcher,
 * another exec, or an inline — the invocation tree is type-agnostic at
 * this seam.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) return invokeDispatch(handler, args, invoke);
  // Exhaustive type narrowing; this path is unreachable while Handler
  // stays a union of the three. Added `never` coercion so a future
  // handler variant surfaces as a type error instead of a runtime throw.
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
