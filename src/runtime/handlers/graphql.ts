import type { GraphqlHandler } from "../config.ts";
import { errorResult, type ToolCallResult, type InvokeContext } from "./types.ts";
import { resolveHeaders } from "../connections.ts";
import { performFetch } from "../util/fetch.ts";
import { render, renderJsonLeaves } from "../util/template.ts";

/**
 * Invoke a graphql handler. Always POSTs to the connection URL with
 * JSON body `{ query, variables? }`. Default response: "data" mode
 * extracts the `data` field and flips isError if `errors:` is non-empty.
 * "envelope" mode returns the raw `{data, errors, extensions}` JSON.
 */
export async function invokeGraphql(
  handler: GraphqlHandler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  const spec = handler.graphql;
  const conn = ctx.connections[spec.connection];
  if (conn === undefined) {
    return errorResult(`graphql: unknown connection "${spec.connection}"`);
  }

  const renderCtx = { ...args, probe: ctx.probe };
  const query = render(spec.query, renderCtx);
  const variables = spec.variables === undefined
    ? undefined
    : renderJsonLeaves(spec.variables, renderCtx);
  const payload: Record<string, unknown> = { query };
  if (variables !== undefined) payload["variables"] = variables;

  const connHeaders = await resolveHeaders(conn);
  const headers: Record<string, string> = { ...connHeaders };
  const hasContentType = Object.keys(headers).some(
    (k) => k.toLowerCase() === "content-type",
  );
  if (!hasContentType) {
    headers["Content-Type"] = "application/json";
  }

  // We always fetch in envelope mode so GraphQL error-shape parsing
  // has access to the raw body even on 4xx/5xx, then project to data
  // or envelope before returning.
  const fetchReq: Parameters<typeof performFetch>[0] = {
    method: "POST",
    url: conn.url,
    headers,
    body: JSON.stringify(payload),
    responseMode: "envelope",
  };
  if (spec.timeout_ms !== undefined) fetchReq.timeoutMs = spec.timeout_ms;
  else if (conn.timeout_ms !== undefined) fetchReq.timeoutMs = conn.timeout_ms;

  const raw = await performFetch(fetchReq);
  if (raw.isError) return raw; // host-deny / timeout / network fail

  const envText = raw.content[0]!.text;
  let envelope: { status: number; headers: Record<string, string>; body: string };
  try {
    envelope = JSON.parse(envText) as typeof envelope;
  } catch {
    return errorResult(`graphql: malformed fetch envelope: ${envText}`);
  }

  let parsed: { data?: unknown; errors?: unknown; extensions?: unknown };
  try {
    parsed = JSON.parse(envelope.body) as typeof parsed;
  } catch {
    return errorResult(
      `graphql: response body is not JSON (status ${envelope.status}): ${envelope.body}`,
    );
  }

  const mode = spec.response ?? "body";
  if (mode === "envelope") {
    return {
      content: [
        { type: "text", text: JSON.stringify(parsed) },
      ],
    };
  }

  // data mode
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const first = parsed.errors[0] as { message?: unknown };
    const msg = typeof first?.message === "string" ? first.message : JSON.stringify(first);
    return errorResult(`graphql: ${msg}`);
  }
  const data = parsed.data ?? null;
  return {
    content: [
      { type: "text", text: typeof data === "string" ? data : JSON.stringify(data) },
    ],
  };
}
