/**
 * Minimal Mustache-style string renderer.
 *
 * Supports `{{var}}` and `{{a.b.c}}` dot-paths only. No sections, no
 * conditionals, no partials, no HTML escaping, no lambdas. Logic lives
 * in JSONLogic (Plan 3); this module is string interpolation only.
 *
 * Missing values render as empty string — matching Mustache's standard
 * behavior. Numbers and booleans stringify via `String()`. Objects and
 * arrays JSON-stringify, which is usually what authors want when
 * templating shell args or URLs from structured data.
 *
 * Unclosed `{{` sequences render as literal text. The renderer never
 * throws on malformed input so tool-call templating cannot kill a
 * request that merely had a typo.
 */
const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function render(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(TOKEN_RE, (_match, path: string) => {
    const value = resolvePath(vars, path);
    return stringify(value);
  });
}

function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function renderJsonLeaves(value: unknown, data: Record<string, unknown>): unknown {
  if (typeof value === "string") return render(value, data);
  if (Array.isArray(value)) return value.map((v) => renderJsonLeaves(v, data));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderJsonLeaves(v, data);
    }
    return out;
  }
  return value;
}
