import type { ProbeSpec, ProbesConfig, GraphqlHandler, HttpHandler, Handler } from "./config.ts";
import type { JsonLogicRule } from "./util/jsonlogic.ts";
import type { CompiledConnection } from "./connections.ts";
import { invoke, type InvokeContext, type ToolCallResult } from "./handlers/index.ts";
import { evaluate } from "./util/jsonlogic.ts";

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
    if (typeof e["exec"] === "string") {
      if (e["exec"].length === 0) {
        throw new Error(`config: probes.${name}.exec must be a non-empty string`);
      }
      handler = { exec: e["exec"] };
    } else if (Array.isArray(e["exec"])) {
      const arr = e["exec"] as unknown[];
      if (arr.length === 0) {
        throw new Error(`config: probes.${name}.exec array must not be empty`);
      }
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== "string") {
          throw new Error(`config: probes.${name}.exec[${i}] must be a string`);
        }
      }
      handler = { exec: arr as string[] };
    } else {
      throw new Error(`config: probes.${name}.exec must be a non-empty string or array of strings`);
    }
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

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolve every probe in the config at boot.
 *
 * Each probe runs concurrently via Promise.allSettled. On any failure
 * (handler isError, timeout, malformed map: evaluation), this function
 * writes a multi-line block to stderr listing every failed probe and
 * calls process.exit(1). The MCP server does not start in a degraded
 * state.
 *
 * Per-probe context at boot is empty: `args = {}`, `probe = {}`.
 * v1 probes cannot reference other probes; probe is always seeded empty.
 */
export async function resolveProbes(
  probes: ProbesConfig | undefined,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<Record<string, unknown>> {
  if (probes === undefined || Object.keys(probes).length === 0) {
    return {};
  }

  const ctx: InvokeContext = {
    connections: compiledConnections,
    probe: {},
  };

  const entries = Object.entries(probes);
  const settled = await Promise.allSettled(
    entries.map(([name, spec]) => resolveOne(name, spec, ctx)),
  );

  const failures: { name: string; reason: string }[] = [];
  const values: Record<string, unknown> = {};

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    const name = entries[i]![0];
    if (r.status === "fulfilled") {
      values[name] = r.value;
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failures.push({ name, reason });
    }
  }

  if (failures.length > 0) {
    const header = `jig: probe resolution failed for ${failures.length} probe${failures.length === 1 ? "" : "s"} (server will not start):`;
    const body = failures
      .map((f) => `\n  probe "${f.name}":\n    ${f.reason}`)
      .join("");
    process.stderr.write(`${header}\n${body}\n\n`);
    process.exit(1);
  }

  return values;
}

async function resolveOne(
  name: string,
  spec: ProbeSpec,
  ctx: InvokeContext,
): Promise<unknown> {
  const timeoutMs = spec.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  // ProbeHandler is a structural subset of Handler; cast needed because
  // { exec: string } in ProbeHandler doesn't alias ExecHandler by name.
  const handler = spec.handler as Handler;
  const dispatchPromise = invoke(handler, {}, ctx);

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`probe "${name}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  let raw: ToolCallResult;
  try {
    raw = await Promise.race([dispatchPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }

  if (raw.isError) {
    throw new Error(raw.content[0]?.text ?? "handler returned isError with no text");
  }

  const text = raw.content[0]?.text ?? "";

  if (spec.map === undefined) return text;

  // map: is present — parse the handler text as JSON so the rule can
  // traverse it. Fall back to the raw string if it's not JSON.
  // The map: rule sees `{ result: <parsed-or-raw> }`.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  try {
    return await evaluate(spec.map, { result: parsed });
  } catch (err) {
    throw new Error(
      `map: rule failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
