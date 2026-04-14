import type { HttpHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import type { CompiledConnection } from "../connections.ts";
import { resolveHeaders } from "../connections.ts";
import { performFetch } from "../util/fetch.ts";
import { render } from "../util/template.ts";

/**
 * Invoke an http handler. Composition order:
 *
 *   1. Resolve the base URL from connection or the handler's own url.
 *   2. Render path, url, query values, header values, and body string
 *      leaves through Mustache against args.
 *   3. Append path to base URL (if present). Append query string if
 *      the handler declared query.
 *   4. Resolve connection headers (ADR-0009 env allowlist applies).
 *      Merge handler headers over connection headers (handler wins).
 *   5. Serialize body: mapping → JSON + Content-Type: application/json;
 *      string → raw body, author sets content type via headers.
 *   6. Delegate to performFetch.
 */
export async function invokeHttp(
  handler: HttpHandler,
  args: Record<string, unknown>,
  compiledConnections: Record<string, CompiledConnection>,
): Promise<ToolCallResult> {
  const spec = handler.http;

  // Step 1 — base URL
  let baseUrl: string | undefined;
  let compiledConnection: CompiledConnection | undefined;
  if (spec.connection !== undefined) {
    compiledConnection = compiledConnections[spec.connection];
    if (compiledConnection === undefined) {
      return errorResult(`http: unknown connection "${spec.connection}"`);
    }
    baseUrl = compiledConnection.url;
  }
  if (spec.url !== undefined) {
    baseUrl = render(spec.url, args);
  }
  if (baseUrl === undefined) {
    return errorResult(`http: neither connection nor url resolved to a URL`);
  }

  // Step 2 — render path + query + header values
  const pathRendered = spec.path !== undefined ? render(spec.path, args) : "";
  let fullUrl = baseUrl + pathRendered;
  if (spec.query !== undefined) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(spec.query)) {
      params.append(k, render(v, args));
    }
    const qs = params.toString();
    if (qs.length > 0) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
    }
  }

  // Step 3/4 — headers
  const connHeaders = compiledConnection
    ? await resolveHeaders(compiledConnection)
    : {};
  const mergedHeaders: Record<string, string> = { ...connHeaders };
  if (spec.headers) {
    for (const [k, v] of Object.entries(spec.headers)) {
      mergedHeaders[k] = render(v, args);
    }
  }

  // Step 5 — body
  let body: string | undefined;
  if (spec.body !== undefined) {
    if (typeof spec.body === "string") {
      body = render(spec.body, args);
    } else {
      const jsonReady = renderJsonLeaves(spec.body, args);
      body = JSON.stringify(jsonReady);
      const hasContentType = Object.keys(mergedHeaders).some(
        (k) => k.toLowerCase() === "content-type",
      );
      if (!hasContentType) {
        mergedHeaders["Content-Type"] = "application/json";
      }
    }
  }

  // Step 6 — fetch
  const responseMode = spec.response ?? "body";
  const timeoutMs = spec.timeout_ms ?? compiledConnection?.timeout_ms;
  const fetchReq: Parameters<typeof performFetch>[0] = {
    method: spec.method,
    url: fullUrl,
    headers: mergedHeaders,
    responseMode,
  };
  if (body !== undefined) fetchReq.body = body;
  if (timeoutMs !== undefined) fetchReq.timeoutMs = timeoutMs;
  return performFetch(fetchReq);
}

/**
 * Walk a body mapping and render Mustache in every string leaf against
 * args. Non-strings pass through.
 */
function renderJsonLeaves(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === "string") return render(value, args);
  if (Array.isArray(value)) return value.map((v) => renderJsonLeaves(v, args));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderJsonLeaves(v, args);
    }
    return out;
  }
  return value;
}

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
