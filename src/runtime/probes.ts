import type { ProbeSpec, ProbesConfig, GraphqlHandler, HttpHandler } from "./config.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";

const KNOWN_KEYS = new Set([
  "graphql", "http", "exec", "map", "timeout_ms",
]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate the top-level `probes:` block.
 *
 * Rules:
 *   - probes is undefined OR a mapping (rejects array, scalar, null)
 *   - each probe name matches /^[A-Za-z_][A-Za-z0-9_]*$/ (Mustache-safe)
 *   - each entry declares exactly one of graphql / http / exec
 *   - map: when present, accepted as arbitrary JSON (structural validation
 *     deferred to evaluation time, matching the `compute:` convention)
 *   - timeout_ms: optional positive number
 *   - unknown keys rejected
 */
export function validateProbes(v: unknown): ProbesConfig | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("config: probes must be a mapping");
  }
  const raw = v as Record<string, unknown>;
  const out: ProbesConfig = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!NAME_RE.test(name)) {
      throw new Error(
        `config: probes.${name}: probe names must match ${NAME_RE} (alphanumeric + underscore, no leading digit)`,
      );
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`config: probes.${name} must be a mapping`);
    }
    out[name] = validateProbeEntry(entry as Record<string, unknown>, name);
  }
  return out;
}

function validateProbeEntry(e: Record<string, unknown>, name: string): ProbeSpec {
  // Reject unknown keys first so a typo'd "exec1" surfaces clearly.
  for (const key of Object.keys(e)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`config: probes.${name}: unknown key "${key}"`);
    }
  }

  const handlerKeys = ["graphql", "http", "exec"].filter((k) => e[k] !== undefined);
  if (handlerKeys.length === 0) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got none)`,
    );
  }
  if (handlerKeys.length > 1) {
    throw new Error(
      `config: probes.${name}: must declare exactly one of graphql, http, exec (got ${handlerKeys.join(", ")})`,
    );
  }

  // Build the handler shape. We do NOT re-validate the inner handler here —
  // graphql/http get reused from validateGraphql/validateHttp at boot time
  // when they're actually invoked (resolveProbes, Phase 2). exec gets a
  // shape check here because it's a leaf.
  let handler: ProbeSpec["handler"];
  if (e["exec"] !== undefined) {
    if (typeof e["exec"] !== "string" || e["exec"].length === 0) {
      throw new Error(`config: probes.${name}.exec must be a non-empty string`);
    }
    handler = { exec: e["exec"] };
  } else if (e["graphql"] !== undefined) {
    if (!e["graphql"] || typeof e["graphql"] !== "object") {
      throw new Error(`config: probes.${name}.graphql must be a mapping`);
    }
    // Pass through; validateGraphql in config.ts validates shape at handler
    // dispatch. Probe-time validation would duplicate that logic.
    handler = { graphql: e["graphql"] } as GraphqlHandler;
  } else {
    if (!e["http"] || typeof e["http"] !== "object") {
      throw new Error(`config: probes.${name}.http must be a mapping`);
    }
    handler = { http: e["http"] } as HttpHandler;
  }

  const out: ProbeSpec = { handler };

  if (e["map"] !== undefined) {
    out.map = e["map"] as JsonLogicRule;
  }

  if (e["timeout_ms"] !== undefined) {
    if (
      typeof e["timeout_ms"] !== "number" ||
      !Number.isFinite(e["timeout_ms"]) ||
      e["timeout_ms"] <= 0
    ) {
      throw new Error(
        `config: probes.${name}.timeout_ms must be a positive number`,
      );
    }
    out.timeout_ms = e["timeout_ms"];
  }

  return out;
}
