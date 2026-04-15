import type { ResourceSpec, ResourcesConfig, WatcherSpec, Handler } from "./config.ts";

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
  "uri", "name", "description", "mimeType", "handler", "watcher",
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
  if (typeof e["uri"] !== "string" || e["uri"].length === 0) {
    throw new Error(`config: resources[${index}].uri is required and must be a non-empty string`);
  }
  const uri = e["uri"];
  try {
    new URL(uri);
  } catch {
    throw new Error(`config: resources[${index}].uri "${uri}" is not a valid URL`);
  }
  if (seen.has(uri)) {
    throw new Error(`config: resources: duplicate uri "${uri}"`);
  }
  seen.add(uri);

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

  const out: ResourceSpec = {
    uri,
    name: e["name"],
    handler,
  };
  if (e["description"] !== undefined) out.description = e["description"] as string;
  if (e["mimeType"] !== undefined) out.mimeType = e["mimeType"] as string;

  if (e["watcher"] !== undefined) {
    out.watcher = validateWatcher(e["watcher"], index);
  }

  return out;
}

const POLLING_KNOWN = new Set(["type", "interval_ms", "change_detection"]);
const FILE_KNOWN = new Set(["type", "path"]);

function validateWatcher(v: unknown, resourceIndex: number): WatcherSpec {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new Error(`config: resources[${resourceIndex}].watcher must be a mapping`);
  }
  const w = v as Record<string, unknown>;
  const type = w["type"];
  if (type !== "polling" && type !== "file") {
    throw new Error(
      `config: resources[${resourceIndex}].watcher.type must be one of polling, file`,
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

  // type === "file"
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
