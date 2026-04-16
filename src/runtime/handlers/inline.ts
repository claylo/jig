import type { InlineHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";

export type { ToolCallResult };

/**
 * The inert handler. Returns `handler.inline.text` verbatim — no
 * Mustache rendering, no tool-arg interpolation, no resource template
 * variable substitution.
 *
 * **Footgun:** `inline: { text: "{{var}}" }` emits the literal string
 * `{{var}}`, NOT the rendered value. This bit Plan 7 twice (Phase 3's
 * templated-resource integration test and the Phase 6 spec). For any
 * handler that needs interpolation — tool args, resource template
 * variables (`{status}` in `queue://jobs/{status}`), env vars, probe
 * values — use:
 *   - `exec:` (or `http:` / `graphql:`) — the handler dispatcher
 *     Mustache-renders `{{var}}` in command/url/body/headers before
 *     invocation.
 *   - `dispatch:` — routes to a sub-handler that itself renders.
 *
 * `inline:` was scoped this way deliberately in Plan 1 as a
 * reachability probe ("did my server config load, and does
 * `tools/call` route back to this process?"). Keeping it inert removes
 * the ambiguity that templating would add at that layer.
 */
export function invokeInline(handler: InlineHandler): ToolCallResult {
  return {
    content: [{ type: "text", text: handler.inline.text }],
  };
}
