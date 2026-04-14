import type { Handler } from "../config.ts";
import type { CompiledConnection } from "../connections.ts";
import type { ToolCallResult } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";
import { invokeCompute } from "./compute.ts";
import { invokeHttp } from "./http.ts";

export interface InvokeContext {
  connections: Record<string, CompiledConnection>;
}

/**
 * Route a resolved Handler to the matching handler implementation.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args);
  if ("dispatch" in handler) {
    return invokeDispatch(handler, args, (h, a) => invoke(h, a, ctx));
  }
  if ("compute" in handler) return invokeCompute(handler, args);
  if ("http" in handler) return invokeHttp(handler, args, ctx.connections);
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult };
