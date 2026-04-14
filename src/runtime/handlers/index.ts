import type { Handler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";
import { invokeCompute } from "./compute.ts";

/**
 * Route a resolved Handler to the matching handler implementation.
 *
 * The function passed down to `invokeDispatch` is `invoke` itself, which
 * is what lets a dispatcher's sub-handler be another dispatcher,
 * another exec, a compute, or an inline — the invocation tree is
 * type-agnostic at this seam.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) return invokeDispatch(handler, args, invoke);
  if ("compute" in handler) return invokeCompute(handler, args);
  // Exhaustive type narrowing; adding a new Handler variant without a
  // new arm here becomes a compile error at this line.
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
