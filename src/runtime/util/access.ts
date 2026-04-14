import { homedir } from "node:os";
import { resolve, isAbsolute, sep } from "node:path";
import { realpathSync } from "node:fs";

export interface FilesystemSecurity {
  allow?: string[];
}

export interface EnvSecurity {
  allow?: string[];
}

export interface SecurityConfig {
  filesystem?: FilesystemSecurity;
  env?: EnvSecurity;
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
 * Configure allowed filesystem roots and env var patterns. Must be called
 * once at runtime boot with the server's SecurityConfig and the absolute
 * path of the runtime-entry directory (RUNTIME_ROOT). Before this runs,
 * every isPathAllowed / isEnvAllowed check returns null/false. That
 * deny-by-default protects tests and library consumers that forget to
 * initialize.
 *
 * Throws a descriptive Error if any allow entry references an unset
 * environment variable, or if a glob pattern is malformed. Fails closed.
 */
export function configureAccess(
  security: SecurityConfig,
  runtimeRoot: string,
): void {
  configuredRuntimeRoot = runtimeRoot;

  // Filesystem allowlist
  const fsEntries = security.filesystem?.allow ?? [...DEFAULT_FILESYSTEM_ALLOW];
  allowedRoots = fsEntries.map((entry) => expandFsEntry(entry, runtimeRoot));

  // Env allowlist
  const envEntries = security.env?.allow ?? [...DEFAULT_ENV_ALLOW];
  allowedEnvPatterns = envEntries.map((pattern) => compileEnvPattern(pattern));
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

/** Reset module state — test-only. */
export function resetAccessForTests(): void {
  allowedRoots = null;
  allowedEnvPatterns = null;
  configuredRuntimeRoot = null;
}
