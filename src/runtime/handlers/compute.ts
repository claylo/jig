import type { ComputeHandler } from "../config.ts";
import type { ToolCallResult, InvokeContext } from "./types.ts";
import { evaluate } from "../util/jsonlogic.ts";

/**
 * Pure JSONLogic handler. Evaluates the compute rule against the tool
 * call args and returns the result as text content.
 *
 * Purity: the handler reads no state outside what the engine provides.
 * Helpers may inspect the filesystem, env, paths, OS, and time (per
 * ADR-0008), gated through ADR-0009 access controls. The handler
 * itself performs no I/O. Side-effect work lives in exec:; network
 * work is Plan 4.
 *
 * Result encoding:
 *   - Strings pass through verbatim.
 *   - Numbers, booleans, null, undefined → String(value).
 *   - Objects and arrays → JSON.stringify (so clients can parse them).
 *
 * Engine errors (unknown operator, malformed rule) become isError
 * results with a "compute:" prefix. They are tool-call failures, not
 * JSON-RPC protocol errors.
 */
export async function invokeCompute(
  handler: ComputeHandler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  try {
    const value = await evaluate(handler.compute, { ...args, probe: ctx.probe });
    return { content: [{ type: "text", text: stringify(value) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `compute: ${message}` }],
      isError: true,
    };
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
