import { homedir } from "node:os";
import { resolve, isAbsolute, sep } from "node:path";
import { realpathSync } from "node:fs";
import type { ConnectionsConfig } from "../config.ts";

export interface FilesystemSecurity {
  allow?: string[];
}

export interface EnvSecurity {
  allow?: string[];
}

export interface NetworkSecurity {
  allow?: string[];
}

export interface SecurityConfig {
  filesystem?: FilesystemSecurity;
  env?: EnvSecurity;
  network?: NetworkSecurity;
}

// Default applied when the server YAML has no `security:` block or a
// subfield is missing. Per ADR-0009.
export const DEFAULT_FILESYSTEM_ALLOW: readonly string[] = ["."];
export const DEFAULT_ENV_ALLOW: readonly string[] = [
  "JIG_*",
  "HOME",
  "USER",
  "LANG",
  "LC_*",
  "TZ",
  "PATH",
];

// Module state — null means configureAccess has not been called yet.
let allowedRoots: string[] | null = null;
let allowedEnvPatterns: RegExp[] | null = null;
let allowedHostPatterns: RegExp[] | null = null;
// Store runtimeRoot for use in path expansion.
let configuredRuntimeRoot: string | null = null;

/**
 * Compile a glob pattern (only * wildcard supported) into a RegExp.
 * Throws if the pattern is empty or contains regex metacharacters other than *.
 */
function compileEnvPattern(pattern: string): RegExp {
  if (pattern.length === 0) {
    throw new Error(`config.security.env.allow: empty pattern is not allowed`);
  }
  // Regex metacharacters we must escape (everything except *)
  // Check for any invalid metacharacters in the original pattern
  // These are chars that have special meaning in regex (excluding *)
  const invalidMeta = /[.+?^${}()|[\]\\]/;
  if (invalidMeta.test(pattern)) {
    throw new Error(
      `config.security.env.allow: pattern "${pattern}" contains unsupported regex metacharacters (only * is supported)`,
    );
  }
  // Now convert * to .* for regex
  const regexStr = "^" + pattern.replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr);
}

/**
 * Compile a host glob pattern (only * wildcard supported). Must match
 * at least one character per wildcard, so "*.github.com" matches
 * "api.github.com" but not bare "github.com".
 */
function compileHostPattern(pattern: string): RegExp {
  if (pattern.length === 0) {
    throw new Error(`config.security.network.allow: empty pattern is not allowed`);
  }
  // We use . literally in a host, so escape it in the compiled regex.
  if (/[+?^${}()|[\]\\]/.test(pattern)) {
    throw new Error(
      `config.security.network.allow: pattern "${pattern}" contains unsupported regex metacharacters (only * is supported)`,
    );
  }
  const escaped = pattern.replace(/\./g, "\\.").replace(/\*/g, ".+");
  return new RegExp("^" + escaped + "$");
}

/**
 * Build the inferred host allowlist from a parsed connections: block.
 * Extracts URL.hostname from each connection's url (which URL already
 * lowercases), deduping repeat hosts. Throws with a clear error if any
 * url fails to parse — caller (configureAccess) surfaces that at boot.
 */
function inferHostsFromConnections(connections: ConnectionsConfig): string[] {
  const hosts: string[] = [];
  for (const [name, def] of Object.entries(connections)) {
    let parsed: URL;
    try {
      parsed = new URL(def.url);
    } catch {
      throw new Error(
        `config: connections.${name}.url is not a valid URL: ${def.url}`,
      );
    }
    if (!hosts.includes(parsed.hostname)) hosts.push(parsed.hostname);
  }
  return hosts;
}

/**
 * Expand a filesystem allow entry against the runtimeRoot.
 * - "." → runtimeRoot
 * - Starts with "~/" or equals "~" → replace leading "~" with homedir()
 * - Contains $VAR or ${VAR} → expand from process.env
 * - After expansion, resolve() against runtimeRoot
 */
function expandFsEntry(entry: string, runtimeRoot: string): string {
  if (entry.length === 0) {
    throw new Error(`config.security.filesystem.allow: empty entry is not allowed`);
  }

  // "." shorthand for runtimeRoot
  if (entry === ".") {
    return runtimeRoot;
  }

  let expanded = entry;

  // Expand $VAR and ${VAR} forms
  // Process ${VAR} first, then $VAR
  expanded = expanded.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, varName: string) => {
    const val = process.env[varName];
    if (val === undefined) {
      throw new Error(
        `config.security.filesystem.allow: environment variable $${varName} is not set`,
      );
    }
    return val;
  });

  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, varName: string) => {
    const val = process.env[varName];
    if (val === undefined) {
      throw new Error(
        `config.security.filesystem.allow: environment variable $${varName} is not set`,
      );
    }
    return val;
  });

  // Expand leading ~ or ~/
  if (expanded === "~" || expanded.startsWith("~/")) {
    expanded = homedir() + expanded.slice(1);
  }

  // Resolve against runtimeRoot to get absolute path
  const abs = isAbsolute(expanded) ? expanded : resolve(runtimeRoot, expanded);

  // Strip trailing separator (but never produce an empty string)
  const trimmed = abs.endsWith(sep) && abs.length > 1 ? abs.slice(0, -1) : abs;

  if (trimmed.length === 0) {
    throw new Error(`config.security.filesystem.allow: entry resolved to an empty path`);
  }

  return trimmed;
}

/**
 * Configure the runtime's access policy. Called once at boot from the
 * server entry point. Sets up three allowlists:
 *
 *   - filesystem roots (compiled via expandFsEntry against runtimeRoot)
 *   - env var patterns (compiled via compileEnvPattern, case-sensitive)
 *   - network host patterns (compiled via compileHostPattern, case-
 *     insensitive per RFC 1035; explicit security.network.allow wins,
 *     otherwise inferred from connections:, otherwise empty)
 *
 * connections is only consulted when security.network.allow is unset;
 * it seeds the inferred host allowlist.
 *
 * Repeated calls replace the prior state — configureAccess is
 * idempotent per call but not additive.
 */
export function configureAccess(
  security: SecurityConfig,
  runtimeRoot: string,
  connections?: ConnectionsConfig,
): void {
  configuredRuntimeRoot = runtimeRoot;

  // Filesystem allowlist
  const fsEntries = security.filesystem?.allow ?? [...DEFAULT_FILESYSTEM_ALLOW];
  allowedRoots = fsEntries.map((entry) => expandFsEntry(entry, runtimeRoot));

  // Env allowlist
  const envEntries = security.env?.allow ?? [...DEFAULT_ENV_ALLOW];
  allowedEnvPatterns = envEntries.map((pattern) => compileEnvPattern(pattern));

  // Network allowlist: explicit overrides inference; connections populate the
  // inferred list only when no explicit allow is set.
  if (security.network?.allow !== undefined) {
    allowedHostPatterns = security.network.allow.map((pattern) =>
      compileHostPattern(pattern.toLowerCase()),
    );
  } else if (connections !== undefined) {
    const inferred = inferHostsFromConnections(connections);
    allowedHostPatterns = inferred.map((host) => compileHostPattern(host));
  } else {
    allowedHostPatterns = [];
  }
}

/**
 * Resolve the input to its canonical absolute path (following symlinks
 * when it exists on disk, or resolving without canonicalization when it
 * does not), then check that path is under one of the allowed roots.
 * Returns the canonical path when allowed, null when denied, the input
 * is malformed, or configureAccess has not been called.
 */
export function isPathAllowed(input: string): string | null {
  if (allowedRoots === null || configuredRuntimeRoot === null) return null;
  if (typeof input !== "string" || input.length === 0) return null;

  // Compute nominal absolute path
  const nominal = isAbsolute(input) ? input : resolve(configuredRuntimeRoot, input);

  // Try to resolve symlinks; fall back to nominal on failure
  let canonical: string;
  try {
    canonical = realpathSync.native(nominal);
  } catch {
    canonical = nominal;
  }

  // Check against each allowed root
  for (const root of allowedRoots) {
    if (canonical === root || canonical.startsWith(root + sep)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Check an env var NAME against the configured patterns. Only true when
 * at least one pattern matches AND configureAccess has been called.
 * Does not read process.env — the caller does that after the check.
 */
export function isEnvAllowed(name: string): boolean {
  if (allowedEnvPatterns === null) return false;
  return allowedEnvPatterns.some((pattern) => pattern.test(name));
}

/**
 * Check a hostname against the configured allowlist. Only true when
 * at least one pattern matches AND configureAccess has been called.
 */
export function isHostAllowed(hostname: string): boolean {
  if (allowedHostPatterns === null) return false;
  return allowedHostPatterns.some((pattern) => pattern.test(hostname));
}

/** Reset module state — test-only. */
export function resetAccessForTests(): void {
  allowedRoots = null;
  allowedEnvPatterns = null;
  allowedHostPatterns = null;
  configuredRuntimeRoot = null;
}
