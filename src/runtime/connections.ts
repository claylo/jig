import type { ConnectionsConfig, ConnectionDefinition } from "./config.ts";
import { evaluate, type JsonLogicRule } from "./util/jsonlogic.ts";
import { stringify } from "./util/stringify.ts";

/**
 * A compiled connection — URL + timeout_ms resolved at boot; headers
 * split into literal strings and JSONLogic rules. Per-request resolution
 * evaluates each rule against an empty context (connections don't see
 * tool-call args) and combines with literal strings into a final
 * Record<string, string>.
 */
export interface CompiledConnection {
  url: string;
  timeout_ms?: number;
  headers: CompiledHeader[];
}

type CompiledHeader =
  | { kind: "literal"; name: string; value: string }
  | { kind: "rule"; name: string; rule: JsonLogicRule };

export function compileConnections(
  raw: ConnectionsConfig,
): Record<string, CompiledConnection> {
  const out: Record<string, CompiledConnection> = {};
  for (const [name, def] of Object.entries(raw)) {
    out[name] = compileOne(def);
  }
  return out;
}

function compileOne(def: ConnectionDefinition): CompiledConnection {
  const headers: CompiledHeader[] = [];
  if (def.headers) {
    for (const [hname, hval] of Object.entries(def.headers)) {
      if (typeof hval === "string") {
        headers.push({ kind: "literal", name: hname, value: hval });
      } else {
        headers.push({ kind: "rule", name: hname, rule: hval });
      }
    }
  }
  const result: CompiledConnection = { url: def.url, headers };
  if (def.timeout_ms !== undefined) result.timeout_ms = def.timeout_ms;
  return result;
}

/**
 * Resolve a compiled connection's headers to a concrete
 * Record<string, string> for a single request. Evaluates each
 * JSONLogic rule against an empty context — connection-scoped values
 * cannot see tool-call args, by design (args belong to handlers).
 *
 * Null or undefined rule results stringify to "null"/"undefined" per
 * JSONLogic's stringify contract. env.get returns null when the variable
 * is unset or denied by the ADR-0009 allowlist; authors who want fail-
 * closed behavior should assert explicitly (e.g., via jig validate at
 * boot) rather than relying on the header value.
 */
export async function resolveHeaders(
  compiled: CompiledConnection,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const h of compiled.headers) {
    if (h.kind === "literal") {
      out[h.name] = h.value;
      continue;
    }
    const val = await evaluate(h.rule, {});
    out[h.name] = stringify(val);
  }
  return out;
}
