import { createHash } from "node:crypto";
import { watch as fsWatch } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import type { ResourceSpec, ResourcesConfig, WatcherSpec, Handler } from "./config.ts";
import type { JigServerHandle, RegisteredResourceHandle, SubscriptionTracker } from "./server.ts";
import { invoke, type InvokeContext } from "./handlers/index.ts";
import { isPathAllowed } from "./util/access.ts";

// Alias for the static branch of the ResourceSpec union. Watchers can
// only attach to static URIs (template+watcher is rejected at parse
// time), so every watcher helper narrows to this branch.
type ResourceSpecStatic = Extract<ResourceSpec, { uri: string }>;

/**
 * Validate the top-level `resources:` block.
 *
 * Rules:
 *   - resources is undefined OR an array (rejects mapping, scalar, null)
 *   - each entry has required uri (parseable as URL) + name (non-empty)
 *     + handler (delegated to validateHandler via the caller)
 *   - uris are unique across the block
 *   - watcher: optional; when present, union of polling { interval_ms,
 *     change_detection? } | file { path }
 *   - unknown keys at entry and watcher level are rejected
 *
 * The `validateHandler` callback is injected so this module doesn't pull
 * config.ts's private handler validator.
 */
export function validateResources(
  v: unknown,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
): ResourcesConfig | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new Error("config: resources must be an array");
  }
  const out: ResourcesConfig = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    out.push(validateResourceEntry(v[i], i, validateHandler, seen));
  }
  return out;
}

const ENTRY_KNOWN = new Set([
  "uri", "template", "name", "description", "mimeType", "handler", "watcher",
]);

function validateResourceEntry(
  entry: unknown,
  index: number,
  validateHandler: (h: unknown, ownerLabel: string) => Handler,
  seen: Set<string>,
): ResourceSpec {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`config: resources[${index}] must be a mapping`);
  }
  const e = entry as Record<string, unknown>;
  for (const key of Object.keys(e)) {
    if (!ENTRY_KNOWN.has(key)) {
      throw new Error(`config: resources[${index}]: unknown key "${key}"`);
    }
  }
  const hasUri = typeof e["uri"] === "string" && e["uri"].length > 0;
  const hasTemplate = typeof e["template"] === "string" && (e["template"] as string).length > 0;

  if (!hasUri && !hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required`);
  }
  if (hasUri && hasTemplate) {
    throw new Error(`config: resources[${index}]: exactly one of uri or template is required`);
  }

  if (hasTemplate && e["watcher"] !== undefined) {
    throw new Error(
      `config: resources[${index}]: template resource cannot carry a watcher (watching a family-of-URIs is unbounded)`,
    );
  }

  if (hasUri) {
    const uri = e["uri"] as string;
    try {
      new URL(uri);
    } catch {
      throw new Error(`config: resources[${index}].uri "${uri}" is not a valid URL`);
    }
    if (seen.has(uri)) {
      throw new Error(`config: resources: duplicate uri "${uri}"`);
    }
    seen.add(uri);
  } else {
    // template branch — track template string in the same seen set
    // (a valid URL can't contain `{`, so no collisions are possible)
    const tmpl = e["template"] as string;
    if (seen.has(tmpl)) {
      throw new Error(`config: resources: duplicate template "${tmpl}"`);
    }
    seen.add(tmpl);
  }

  if (typeof e["name"] !== "string" || e["name"].length === 0) {
    throw new Error(`config: resources[${index}].name is required and must be a non-empty string`);
  }

  if (e["description"] !== undefined && typeof e["description"] !== "string") {
    throw new Error(`config: resources[${index}].description must be a string`);
  }
  if (e["mimeType"] !== undefined && typeof e["mimeType"] !== "string") {
    throw new Error(`config: resources[${index}].mimeType must be a string`);
  }

  if (!e["handler"] || typeof e["handler"] !== "object") {
    throw new Error(`config: resources[${index}].handler is required and must be a mapping`);
  }
  const handler = validateHandler(e["handler"], `resources[${index}]`);

  const out: ResourceSpec = hasUri
    ? { uri: e["uri"] as string, name: e["name"] as string, handler }
    : { template: e["template"] as string, name: e["name"] as string, handler };

  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (e["mimeType"] !== undefined) out.mimeType = e["mimeType"] as string;

  if (e["watcher"] !== undefined) {
    (out as ResourceSpecStatic).watcher = validateWatcher(e["watcher"], index);
  }

  return out;
}

const POLLING_KNOWN = new Set(["type", "interval_ms", "change_detection"]);
const FILE_KNOWN = new Set(["type", "path"]);
const WEBHOOK_KNOWN = new Set(["type", "port", "path"]);

function validateWatcher(v: unknown, resourceIndex: number): WatcherSpec {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: resources[${resourceIndex}].watcher must be a mapping`);
  }
  const w = v as Record<string, unknown>;
  const type = w["type"];
  if (type !== "polling" && type !== "file" && type !== "webhook") {
    throw new Error(
      `config: resources[${resourceIndex}].watcher.type must be one of polling, file, webhook`,
    );
  }

  if (type === "polling") {
    for (const key of Object.keys(w)) {
      if (!POLLING_KNOWN.has(key)) {
        throw new Error(`config: resources[${resourceIndex}].watcher polling watcher: unknown key "${key}"`);
      }
    }
    const interval = w["interval_ms"];
    if (interval === undefined) {
      throw new Error(`config: resources[${resourceIndex}].watcher polling watcher requires interval_ms`);
    }
    if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher.interval_ms must be a positive number`);
    }
    const cd = w["change_detection"];
    if (cd !== undefined && cd !== "hash" && cd !== "always") {
      throw new Error(`config: resources[${resourceIndex}].watcher.change_detection must be "hash" or "always"`);
    }
    const out: WatcherSpec = { type: "polling", interval_ms: interval };
    if (cd !== undefined) out.change_detection = cd as "hash" | "always";
    return out;
  }

  if (type === "file") {
    for (const key of Object.keys(w)) {
      if (!FILE_KNOWN.has(key)) {
        throw new Error(`config: resources[${resourceIndex}].watcher file watcher: unknown key "${key}"`);
      }
    }
    const path = w["path"];
    if (typeof path !== "string" || path.length === 0) {
      throw new Error(`config: resources[${resourceIndex}].watcher file watcher requires path (non-empty string)`);
    }
    return { type: "file", path };
  }

  // type === "webhook"
  for (const key of Object.keys(w)) {
    if (!WEBHOOK_KNOWN.has(key)) {
      throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher: unknown key "${key}"`);
    }
  }
  const port = w["port"];
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher requires port (integer 1-65535)`);
  }
  const webhookPath = w["path"];
  if (webhookPath !== undefined && (typeof webhookPath !== "string" || webhookPath.length === 0)) {
    throw new Error(`config: resources[${resourceIndex}].watcher webhook watcher: path must be a non-empty string`);
  }
  const out: WatcherSpec = { type: "webhook", port };
  if (typeof webhookPath === "string") out.path = webhookPath;
  return out;
}

/**
 * Handle type alias for the return value of registerResource. Named so
 * the future graceful-shutdown plan can collect these per resource.
 */
export type { RegisteredResourceHandle };

/**
 * Register every resource in the config with the MCP server. Returns an
 * array of SDK handles for future reload/shutdown consumers; v1 ignores
 * the return value.
 *
 * Each resource's read callback invokes the configured handler with
 * empty args and the boot InvokeContext (connections + probe). The
 * handler's ToolCallResult is translated into a ReadResourceResult:
 *   - content[0].text becomes contents[0].text
 *   - mimeType carries through from the resource spec
 *   - isError: true becomes a thrown Error — the SDK surfaces it as a
 *     JSON-RPC error response
 */
export function registerResources(
  server: JigServerHandle,
  resources: ResourcesConfig,
  ctx: InvokeContext,
): RegisteredResourceHandle[] {
  const handles: RegisteredResourceHandle[] = [];
  for (const spec of resources) {
    if (typeof spec.template === "string") {
      // URI-template branch: RFC 6570 variables are extracted by the SDK
      // and passed into the handler alongside the probe context.
      const handle = server.registerResourceTemplate(
        spec.name,
        spec.template,
        {
          ...(spec.description !== undefined && { description: spec.description }),
          ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
        },
        async (uri, variables) => {
          const args = { ...variables, probe: ctx.probe };
          const raw = await invoke(spec.handler, args, ctx);
          if (raw.isError) {
            const msg = raw.content[0]?.text ?? "<handler returned isError with no text>";
            throw new Error(`resource "${uri.toString()}" read failed: ${msg}`);
          }
          return {
            contents: [
              {
                uri: uri.toString(),
                ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
                text: raw.content[0]?.text ?? "",
              },
            ],
          };
        },
      );
      handles.push(handle as unknown as RegisteredResourceHandle);
    } else {
      // Static URI branch — unchanged from Plan 6.
      const handle = server.registerResource(
        spec.uri,
        {
          name: spec.name,
          ...(spec.description !== undefined && { description: spec.description }),
          ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
        },
        async (uri) => {
          const raw = await invoke(spec.handler, {}, ctx);
          if (raw.isError) {
            const msg = raw.content[0]?.text ?? "<handler returned isError with no text>";
            throw new Error(`resource "${uri.toString()}" read failed: ${msg}`);
          }
          return {
            contents: [
              {
                uri: uri.toString(),
                ...(spec.mimeType !== undefined && { mimeType: spec.mimeType }),
                text: raw.content[0]?.text ?? "",
              },
            ],
          };
        },
      );
      handles.push(handle);
    }
  }
  return handles;
}

/**
 * Disposer returned per watcher. v1 collects these but never invokes;
 * process exit cleans up setInterval / fs.watch handles.
 */
export type WatcherDisposer = () => void;

/**
 * Start every watcher declared in the config. Polling watchers
 * re-invoke the handler on an interval and hash the result; file
 * watchers (Phase 4) subscribe to fs.watch events on a path. Both
 * emit resources/updated only when the URI is subscribed.
 *
 * Watcher failures log to stderr and skip the emit; the server does not
 * crash. A handler whose upstream is transiently flaking must not take
 * down an otherwise-running session.
 */
export function startWatchers(
  resources: ResourcesConfig,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
  ctx: InvokeContext,
): WatcherDisposer[] {
  const disposers: WatcherDisposer[] = [];
  for (const spec of resources) {
    if (!spec.watcher) continue;
    if (spec.watcher.type === "polling") {
      disposers.push(startPollingWatcher(spec, spec.watcher, server, tracker, ctx));
    } else if (spec.watcher.type === "file") {
      disposers.push(startFileWatcher(spec, spec.watcher, server, tracker));
    } else if (spec.watcher.type === "webhook") {
      disposers.push(startWebhookWatcher(spec, spec.watcher, server, tracker));
    }
  }
  return disposers;
}

function startPollingWatcher(
  resource: ResourceSpecStatic,
  watcher: Extract<WatcherSpec, { type: "polling" }>,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
  ctx: InvokeContext,
): WatcherDisposer {
  const detection = watcher.change_detection ?? "hash";
  let lastHash: string | undefined;

  const tick = async () => {
    try {
      const raw = await invoke(resource.handler, {}, ctx);
      if (raw.isError) {
        process.stderr.write(
          `jig: watcher for "${resource.uri}" handler returned isError: ${raw.content[0]?.text ?? "<no text>"}\n`,
        );
        return;
      }
      const text = raw.content[0]?.text ?? "";
      if (detection === "hash") {
        const hash = createHash("sha256").update(text).digest("hex");
        if (lastHash === undefined) {
          // First tick — establish baseline, no emit.
          lastHash = hash;
          return;
        }
        if (hash === lastHash) return;
        lastHash = hash;
      }
      // change_detection === "always" emits every tick; "hash" emits
      // only when the hash differs. Either way, gate on subscription
      // state.
      if (tracker.isSubscribed(resource.uri)) {
        await server.sendResourceUpdated(resource.uri);
      }
    } catch (err) {
      process.stderr.write(
        `jig: watcher for "${resource.uri}" threw: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, watcher.interval_ms);
  // Don't block process exit on the interval.
  handle.unref();

  // Fire an immediate tick so the baseline hash is captured before the
  // first real interval elapses. Without it, a client that subscribes
  // and mutates the underlying data inside the first interval window
  // would never see an update (the tick-at-interval-1 establishes
  // the baseline based on post-mutation content).
  void tick();

  return () => clearInterval(handle);
}

function startFileWatcher(
  resource: ResourceSpecStatic,
  watcher: Extract<WatcherSpec, { type: "file" }>,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
): WatcherDisposer {
  // isPathAllowed returns the canonical (symlink-resolved) path when
  // allowed, or null when denied. Use the canonical form for fs.watch so
  // the watched path stays consistent with the allowlist root — on macOS,
  // /tmp resolves to /private/tmp and configureAccess canonicalizes the
  // allowlist the same way.
  const canonicalPath = isPathAllowed(watcher.path);
  if (!canonicalPath) {
    // Fail-fast at boot, same stderr shape as probe failures.
    process.stderr.write(
      `jig: resource "${resource.uri}" watcher path "${watcher.path}" is not in server.security.filesystem.allow\n\n`,
    );
    process.exit(1);
  }

  let handle: ReturnType<typeof fsWatch> | undefined;
  try {
    handle = fsWatch(canonicalPath, { persistent: false }, (_eventType) => {
      if (tracker.isSubscribed(resource.uri)) {
        void server.sendResourceUpdated(resource.uri).catch((err) => {
          process.stderr.write(
            `jig: watcher emit for "${resource.uri}" failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        });
      }
    });
    handle.on("error", (err) => {
      process.stderr.write(
        `jig: fs.watch for "${resource.uri}" (${watcher.path}) error: ${err.message}\n`,
      );
    });
  } catch (err) {
    process.stderr.write(
      `jig: failed to start fs.watch for "${resource.uri}" (${watcher.path}): ${err instanceof Error ? err.message : String(err)}\n\n`,
    );
    process.exit(1);
  }

  return () => {
    try {
      handle?.close();
    } catch {
      // watcher close errors are fine to swallow on shutdown
    }
  };
}

function startWebhookWatcher(
  resource: ResourceSpecStatic,
  watcher: Extract<WatcherSpec, { type: "webhook" }>,
  server: JigServerHandle,
  tracker: SubscriptionTracker,
): WatcherDisposer {
  const webhookPath = watcher.path ?? "/webhook";
  let httpServer: Server | undefined;

  try {
    httpServer = createHttpServer((req, res) => {
      if (req.method !== "POST" || req.url !== webhookPath) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      if (tracker.isSubscribed(resource.uri)) {
        void server.sendResourceUpdated(resource.uri).catch((err) => {
          process.stderr.write(
            `jig: webhook emit for "${resource.uri}" failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        });
      }

      res.writeHead(204);
      res.end();
    });

    httpServer.listen(watcher.port, "127.0.0.1", () => {
      process.stderr.write(
        `jig: webhook watcher for "${resource.uri}" listening on http://127.0.0.1:${watcher.port}${webhookPath}\n`,
      );
    });

    httpServer.on("error", (err) => {
      process.stderr.write(
        `jig: webhook watcher for "${resource.uri}" error: ${err.message}\n`,
      );
    });
  } catch (err) {
    process.stderr.write(
      `jig: failed to start webhook watcher for "${resource.uri}": ${err instanceof Error ? err.message : String(err)}\n\n`,
    );
    process.exit(1);
  }

  return () => {
    httpServer?.close();
  };
}
