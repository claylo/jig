// SDK adapter for Streamable HTTP transport. See src/runtime/server.ts for
// the rationale — keep all direct SDK imports quarantined here and in
// server.ts.
//
// The SDK's WebStandardStreamableHTTPServerTransport speaks Web Standard
// Request/Response. Node 24's node:http still hands us IncomingMessage /
// ServerResponse, so this module bridges between the two: Node request in,
// Web Standard Request to the SDK, Web Standard Response back out to Node.

import { createServer as createHttpServer, type Server } from "node:http";
import { Readable } from "node:stream";
import {
  WebStandardStreamableHTTPServerTransport,
  type Transport,
} from "@modelcontextprotocol/server";

export interface HttpTransportOptions {
  port: number;
  hostname?: string;
  /** MCP endpoint path. Defaults to "/mcp". */
  path?: string;
  sessionIdGenerator?: () => string;
  /** Allowed Origin headers for CORS/rebinding protection. Defaults to none (all Origins rejected). */
  allowedOrigins?: string[];
}

export interface HttpTransportHandle {
  transport: Transport;
  /** The underlying node:http server — exposed so the caller can shut it down. */
  httpServer: Server;
  /** Resolves once the HTTP server is listening. */
  listening: Promise<{ port: number; hostname: string }>;
}

export function createHttpTransport(
  options: HttpTransportOptions,
): HttpTransportHandle {
  const mcpPath = options.path ?? "/mcp";
  const hostname = options.hostname ?? "127.0.0.1";

  // Build the set of allowed Host header values (loopback variants + port).
  const allowedHosts = new Set<string>();
  for (const h of [hostname, "127.0.0.1", "localhost", "::1"]) {
    allowedHosts.add(`${h}:${options.port}`);
    allowedHosts.add(h);
  }

  const allowedOrigins = options.allowedOrigins
    ? new Set(options.allowedOrigins)
    : undefined;

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: options.sessionIdGenerator ?? (() => crypto.randomUUID()),
  });

  const httpServer = createHttpServer(async (req, res) => {
    // DNS-rebinding protection: reject requests whose Host header doesn't
    // match a known loopback address. Browsers set Host from the URL bar,
    // so a rebinding attack will carry the attacker's domain here.
    const hostHeader = req.headers.host;
    if (!hostHeader || !allowedHosts.has(hostHeader)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: invalid Host header");
      return;
    }

    // Origin check: if Origin is present (browser requests), it must be
    // on the allowlist. Non-browser clients (curl, MCP SDKs) omit Origin.
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!allowedOrigins || !allowedOrigins.has(origin)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: invalid Origin header");
        return;
      }
    }

    // Only serve the MCP endpoint path.
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
    if (url.pathname !== mcpPath) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    try {
      const webRequest = nodeToWebRequest(req, url);
      const webResponse = await transport.handleRequest(webRequest);
      await writeWebResponse(webResponse, res);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`jig http: request error: ${message}\n`);
    }
  });

  const listening = new Promise<{ port: number; hostname: string }>(
    (resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(options.port, hostname, () => {
        httpServer.removeListener("error", reject);
        const addr = httpServer.address();
        const actualPort =
          typeof addr === "object" && addr !== null ? addr.port : options.port;
        resolve({ port: actualPort, hostname });
      });
    },
  );

  return { transport, httpServer, listening };
}

/**
 * Bridge Node's IncomingMessage into a Web Standard Request. Node 24
 * supports the global Request constructor and Readable.toWeb(), so no
 * polyfills are needed.
 */
function nodeToWebRequest(
  req: import("node:http").IncomingMessage,
  url: URL,
): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(url.href, {
    method,
    headers,
    body: hasBody
      ? (Readable.toWeb(req) as ReadableStream<Uint8Array>)
      : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

/**
 * Pipe a Web Standard Response back through Node's ServerResponse.
 * Handles both streaming (SSE) and non-streaming responses.
 */
async function writeWebResponse(
  webResponse: Response,
  res: import("node:http").ServerResponse,
): Promise<void> {
  res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));

  if (!webResponse.body) {
    res.end();
    return;
  }

  const reader = webResponse.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const ok = res.write(value);
      if (!ok) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}
