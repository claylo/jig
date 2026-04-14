import { statSync, accessSync, constants as fsConstants } from "node:fs";
import { dirname, join as pathJoin, resolve as pathResolve, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch, homedir, tmpdir } from "node:os";
import { getEngine } from "./jsonlogic.ts";
import { isPathAllowed, isEnvAllowed } from "./access.ts";

/**
 * Built-in JSONLogic helpers per ADR-0008 (16 helpers across 5 namespaces).
 *
 * Every helper:
 *   - Returns null (value-bearing) or false (boolean) on any failure
 *   - Never throws — a thrown exception in a guard poisons dispatch
 *   - Resolves relative paths against dirname(import.meta.url) per ADR-0005
 *   - Is side-effect-free (read-only)
 *
 * File and env helpers are gated by access controls per ADR-0009.
 * path.* helpers are pure string ops — no disk read, no gate.
 *
 * This module registers against the shared engine from util/jsonlogic.ts
 * at import time. Callers pull in this module for its side effects.
 */

// Used ONLY by path.resolve for relative-to-runtime anchoring (pure string op,
// not a disk read — no allowlist concern). File helpers route through access.ts.
const RUNTIME_ROOT = dirname(fileURLToPath(import.meta.url));

// --- file namespace -------------------------------------------------------

function fileExists([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    accessSync(canonical, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function fileIsFile([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    return statSync(canonical).isFile();
  } catch {
    return false;
  }
}

function fileIsDir([rawPath]: unknown[]): boolean {
  if (typeof rawPath !== "string" || rawPath.length === 0) return false;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return false;
  try {
    return statSync(canonical).isDirectory();
  } catch {
    return false;
  }
}

function fileSize([rawPath]: unknown[]): number | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const canonical = isPathAllowed(rawPath);
  if (canonical === null) return null;
  try {
    return statSync(canonical).size;
  } catch {
    return null;
  }
}

// --- env namespace --------------------------------------------------------

function envGet([rawName]: unknown[]): string | null {
  if (typeof rawName !== "string" || rawName.length === 0) return null;
  if (!isEnvAllowed(rawName)) return null;
  const value = process.env[rawName];
  return value === undefined ? null : value;
}

function envHas([rawName]: unknown[]): boolean {
  if (typeof rawName !== "string" || rawName.length === 0) return false;
  if (!isEnvAllowed(rawName)) return false;
  return Object.prototype.hasOwnProperty.call(process.env, rawName);
}

// --- path namespace -------------------------------------------------------

function pathJoinHelper(parts: unknown[]): string | null {
  if (parts.length === 0) return null;
  const strings: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") return null;
    strings.push(part);
  }
  try {
    return pathJoin(...strings);
  } catch {
    return null;
  }
}

function pathResolveHelper([rawPath]: unknown[]): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    // Pure string op — anchor relative paths to RUNTIME_ROOT. No disk read.
    if (isAbsolute(rawPath)) return rawPath;
    return pathResolve(RUNTIME_ROOT, rawPath);
  } catch {
    return null;
  }
}

function pathDirname([rawPath]: unknown[]): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    return dirname(rawPath);
  } catch {
    return null;
  }
}

function pathBasename(args: unknown[]): string | null {
  const [rawPath, ext] = args;
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  try {
    if (typeof ext === "string") return basename(rawPath, ext);
    return basename(rawPath);
  } catch {
    return null;
  }
}

// --- os namespace ---------------------------------------------------------

function osPlatform(): string {
  return platform();
}

function osArch(): string {
  return arch();
}

function osHomedir(): string | null {
  try {
    return homedir();
  } catch {
    return null;
  }
}

function osTmpdir(): string | null {
  try {
    return tmpdir();
  } catch {
    return null;
  }
}

// --- time namespace -------------------------------------------------------

function timeNow(): number {
  return Date.now();
}

function timeIso(): string {
  return new Date().toISOString();
}

// --- registration ---------------------------------------------------------

/**
 * Register all 16 helpers on the shared engine. Called once at module
 * load. `addMethod` accepts sync functions in json-logic-engine v5's
 * async engine — the engine awaits whatever the method returns, so
 * wrapping a sync read as async is unnecessary.
 */
export function registerHelpers(): void {
  const engine = getEngine();

  engine.addMethod("file.exists", fileExists);
  engine.addMethod("file.is_file", fileIsFile);
  engine.addMethod("file.is_dir", fileIsDir);
  engine.addMethod("file.size", fileSize);

  engine.addMethod("env.get", envGet);
  engine.addMethod("env.has", envHas);

  engine.addMethod("path.join", pathJoinHelper);
  engine.addMethod("path.resolve", pathResolveHelper);
  engine.addMethod("path.dirname", pathDirname);
  engine.addMethod("path.basename", pathBasename);

  engine.addMethod("os.platform", osPlatform);
  engine.addMethod("os.arch", osArch);
  engine.addMethod("os.homedir", osHomedir);
  engine.addMethod("os.tmpdir", osTmpdir);

  engine.addMethod("time.now", timeNow);
  engine.addMethod("time.iso", timeIso);
}

// Register on module import so side-effect imports pick everything up.
registerHelpers();
