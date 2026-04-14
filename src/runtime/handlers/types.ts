/**
 * Shared handler result types. Plan 2 adds exec and dispatch, both
 * returning this shape. Keeping it in a neutral module avoids the
 * circular imports that would appear if dispatch imported from inline
 * and inline imported from a central invoke module.
 *
 * The index signature mirrors the SDK's `CallToolResult` shape so lean
 * jig-side results stay structurally assignable to it.
 */
export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}
