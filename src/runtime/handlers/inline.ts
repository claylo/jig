import type { InlineHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";

export type { ToolCallResult };

/**
 * Plan 1's only handler type. Returns the configured text verbatim.
 *
 * Args are ignored on purpose: Mustache/JMESPath interpolation over the
 * incoming args lives in Plan 2's dispatcher + template plan. Keeping
 * this inert means Plan 1 tools work as a reachability probe — "did my
 * server config load, and does `tools/call` route back to this process?"
 * — without the ambiguity that string templating would add.
 */
export function invokeInline(handler: InlineHandler): ToolCallResult {
  return {
    content: [{ type: "text", text: handler.inline.text }],
  };
}
