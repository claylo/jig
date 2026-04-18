import { isHostAllowed } from "./access.ts";
import type { ToolCallResult } from "../handlers/types.ts";

export interface FetchRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | undefined;
  responseMode: "body" | "envelope";
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Perform an outbound HTTP request and map the outcome to a
 * ToolCallResult. Called by http.ts and graphql.ts.
 *
 * Error shaping:
 *   - Host not in network allowlist → isError with host-deny message.
 *   - Network/DNS failure → isError with the underlying error message.
 *   - AbortSignal timeout → isError with "timeout after Nms".
 *   - 4xx/5xx in "body" mode → isError with status + body snippet.
 *   - 4xx/5xx in "envelope" mode → success result with the envelope;
 *     the author handles status-based branching.
 *
 * Success shaping:
 *   - "body" mode → result.content[0].text = response body.
 *   - "envelope" mode → result.content[0].text = JSON.stringify({
 *       status, headers, body }). Headers are lowercased per Node's
 *       Headers API conventions.
 *
 * Implementation notes (node:fetch defaults):
 *   - Response bodies are read via response.text() which decodes as
 *     UTF-8. Binary responses (images, audio) will be corrupted in
 *     envelope mode. Callers needing binary should not use this wrapper.
 *   - Redirects (3xx) are followed automatically by node:fetch; the
 *     caller sees only the final response. To inspect redirect chains,
 *     this wrapper is not the right tool.
 */
export async function performFetch(req: FetchRequest): Promise<ToolCallResult> {
  let parsed: URL;
  try {
    parsed = new URL(req.url);
  } catch {
    return errorResult(`http: invalid url "${req.url}"`);
  }
  if (!isHostAllowed(parsed.hostname)) {
    return errorResult(
      `http: host "${parsed.hostname}" not in server.security.network.allow`,
    );
  }

  const timeout = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeout);

  let response: Response;
  try {
    response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (signal.aborted) {
      return errorResult(`http: timeout after ${timeout}ms`);
    }
    return errorResult(`http: ${msg}`);
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (signal.aborted) {
      return errorResult(`http: timeout reading response body after ${timeout}ms`);
    }
    return errorResult(`http: failed reading response body: ${msg}`);
  }

  if (req.responseMode === "envelope") {
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: response.status,
            headers,
            body: bodyText,
          }),
        },
      ],
    };
  }

  // body mode
  if (response.status >= 400) {
    return errorResult(
      `http: ${req.method} ${req.url} returned ${response.status}: ${bodyText}`,
    );
  }
  return { content: [{ type: "text", text: bodyText }] };
}

function errorResult(text: string): ToolCallResult {
  return { content: [{ type: "text", text }], isError: true };
}
