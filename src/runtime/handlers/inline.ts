import type { InlineHandler } from "../config.ts";

/**
 * Minimum MCP tool-call result shape jig produces in Plan 1. Only text
 * content is emitted; image/resource/embedded-resource content and
 * structured output arrive when later plans start needing them.
 *
 * The index signature mirrors the SDK's `CallToolResult` shape so this
 * lean type is structurally assignable to it — handlers document the
 * minimum they produce without the adapter needing to re-declare the
 * protocol-extras (_meta, structuredContent) they don't touch.
 */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

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
