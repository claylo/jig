import type { ToolCallResult } from "../handlers/types.ts";
import { evaluate, type JsonLogicRule } from "./jsonlogic.ts";

/**
 * Tool-level response reshaping.
 *
 * Called by `src/runtime/index.ts` after `invoke(handler, args)`
 * returns. Reshapes successful handler results against a JSONLogic
 * rule evaluated over `{ result, args }`.
 *
 *   result: the handler's text content, JSON-parsed when possible and
 *           left as a string otherwise
 *   args:   the original tool call arguments
 *
 * isError results pass through unchanged — transforms are a happy-path
 * reshape. An engine error during transform evaluation becomes a new
 * isError with a "transform:" prefix.
 *
 * Encoding on output matches invokeCompute's rules: strings pass
 * through, primitives stringify, objects JSON-stringify.
 */
export async function applyTransform(
  result: ToolCallResult,
  args: Record<string, unknown>,
  rule: JsonLogicRule,
): Promise<ToolCallResult> {
  if (result.isError) return result;

  const rawText = result.content[0]?.text ?? "";
  const parsedResult = tryParseJson(rawText);

  try {
    const reshaped = await evaluate(rule, {
      result: parsedResult,
      args,
    });
    return { content: [{ type: "text", text: stringify(reshaped) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `transform: ${message}` }],
      isError: true,
    };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
