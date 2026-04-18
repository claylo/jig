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

const headerCache = new WeakMap<CompiledConnection, Record<string, string>>();

/**
 * Resolve a compiled connection's headers to a concrete
 * Record<string, string>. Results are cached after first evaluation
 * because rules evaluate against an empty context — the output is
 * deterministic for the process lifetime.
 */
export async function resolveHeaders(
  compiled: CompiledConnection,
): Promise<Record<string, string>> {
  const cached = headerCache.get(compiled);
  if (cached) return cached;

  const out: Record<string, string> = {};
  for (const h of compiled.headers) {
    if (h.kind === "literal") {
      out[h.name] = h.value;
      continue;
    }
    const val = await evaluate(h.rule, {});
    out[h.name] = stringify(val);
  }
  headerCache.set(compiled, out);
  return out;
}
