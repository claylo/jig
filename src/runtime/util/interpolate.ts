import type { JsonLogicRule } from "./jsonlogic.ts";

/**
 * Expand ${VAR} tokens inside a string into a JSONLogic AST that calls
 * env.get. Scope: connection-string values only, invoked by the
 * connections: parser per ADR-0011.
 *
 * Rules:
 *   - No ${...} tokens → return the input string unchanged.
 *   - One bare ${VAR} (nothing else) → return {"env.get":["VAR"]}.
 *   - Multi-token or token + surrounding text → return {"cat": [...]}
 *     with literal string segments interleaved between env.get calls.
 *   - Malformed tokens (${1BAD}, unclosed ${) → passed through literally.
 */

const tokenRegex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandShim(input: string): string | JsonLogicRule {
  if (!input.includes("${")) return input;

  const matches = [...input.matchAll(tokenRegex)];
  if (matches.length === 0) return input;

  // Bare-token short-circuit: the whole string IS a single ${VAR}.
  if (matches.length === 1) {
    const m = matches[0]!;
    if (m[0] === input) {
      return { "env.get": [m[1]!] };
    }
  }

  // General case: split on tokens, interleave literal segments with
  // env.get calls, emit {"cat": [...]} with leading/trailing empties
  // removed.
  const parts: (string | JsonLogicRule)[] = [];
  let cursor = 0;
  for (const m of matches) {
    const start = m.index!;
    if (start > cursor) parts.push(input.slice(cursor, start));
    parts.push({ "env.get": [m[1]!] });
    cursor = start + m[0].length;
  }
  if (cursor < input.length) parts.push(input.slice(cursor));

  // Drop any empty-string segments that snuck in.
  const cleaned = parts.filter((p) => !(typeof p === "string" && p.length === 0));
  if (cleaned.length === 1) {
    const only = cleaned[0]!;
    return only;
  }
  return { cat: cleaned };
}

/**
 * Recursively walk a value and apply expandShim to every string leaf.
 * Arrays walk element-wise; objects walk value-wise. Non-string, non-
 * array, non-object values pass through unchanged. Used by the
 * connections: parser to expand ${VAR} tokens before compilation.
 *
 * Input must be JSON-serializable (no cycles); cyclic objects will
 * stack-overflow.
 */
export function expandShimInTree(value: unknown): unknown {
  if (typeof value === "string") return expandShim(value);
  if (Array.isArray(value)) return value.map(expandShimInTree);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandShimInTree(v);
    }
    return out;
  }
  return value;
}
