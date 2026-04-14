import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform as nodePlatform, arch as nodeArch, homedir, tmpdir } from "node:os";
import { evaluate, type JsonLogicRule } from "../src/runtime/util/jsonlogic.ts";
// Side-effect import: registers the 16 helpers on the shared engine.
import "../src/runtime/util/helpers.ts";
import { configureAccess } from "../src/runtime/util/access.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures", "helpers");
const PRESENT_FILE = join(FIXTURE_DIR, "present.txt");
const MISSING_FILE = join(FIXTURE_DIR, "definitely-missing.txt");
const SUBDIR = join(FIXTURE_DIR, "subdir");

// Scope: tests use fixture files under FIXTURE_DIR and env vars prefixed
// with JIG_HELPERS_TEST_. Configure access to allow exactly those, nothing
// more — so tests also prove denial semantics work.
configureAccess(
  {
    filesystem: { allow: [FIXTURE_DIR] },
    env: { allow: ["JIG_HELPERS_TEST_*", "HOME", "USER", "LANG", "LC_*", "TZ", "PATH"] },
  },
  FIXTURE_DIR, // runtimeRoot is the fixture dir for the purposes of these tests
);

// --- file namespace -------------------------------------------------------

test("file.exists returns true for an existing file", async () => {
  const rule: JsonLogicRule = { "file.exists": [PRESENT_FILE] };
  assert.equal(await evaluate(rule, {}), true);
});

test("file.exists returns false for a missing path", async () => {
  const rule: JsonLogicRule = { "file.exists": [MISSING_FILE] };
  assert.equal(await evaluate(rule, {}), false);
});

test("file.exists returns false (never throws) for garbage input", async () => {
  const rule: JsonLogicRule = { "file.exists": [null] };
  assert.equal(await evaluate(rule, {}), false);
});

test("file.is_file returns true for a regular file, false for a directory", async () => {
  assert.equal(await evaluate({ "file.is_file": [PRESENT_FILE] } as JsonLogicRule, {}), true);
  assert.equal(await evaluate({ "file.is_file": [SUBDIR] } as JsonLogicRule, {}), false);
});

test("file.is_dir returns true for a directory, false for a regular file", async () => {
  assert.equal(await evaluate({ "file.is_dir": [SUBDIR] } as JsonLogicRule, {}), true);
  assert.equal(await evaluate({ "file.is_dir": [PRESENT_FILE] } as JsonLogicRule, {}), false);
});

test("file.size returns byte count for an existing file", async () => {
  // "present\n" = 8 bytes on disk.
  const result = await evaluate({ "file.size": [PRESENT_FILE] } as JsonLogicRule, {});
  assert.equal(typeof result, "number");
  assert.ok((result as number) >= 7); // tolerate trailing newline variance
});

test("file.size returns null for a missing path", async () => {
  const result = await evaluate({ "file.size": [MISSING_FILE] } as JsonLogicRule, {});
  assert.equal(result, null);
});

// --- env namespace --------------------------------------------------------

test("env.get returns the value when the variable is set", async () => {
  process.env["JIG_HELPERS_TEST_SET"] = "found";
  try {
    const result = await evaluate({ "env.get": ["JIG_HELPERS_TEST_SET"] } as JsonLogicRule, {});
    assert.equal(result, "found");
  } finally {
    delete process.env["JIG_HELPERS_TEST_SET"];
  }
});

test("env.get returns null when the variable is not set", async () => {
  delete process.env["JIG_HELPERS_TEST_MISSING"];
  const result = await evaluate({ "env.get": ["JIG_HELPERS_TEST_MISSING"] } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("env.has returns true when the variable is set (even to empty string)", async () => {
  process.env["JIG_HELPERS_TEST_EMPTY"] = "";
  try {
    const result = await evaluate({ "env.has": ["JIG_HELPERS_TEST_EMPTY"] } as JsonLogicRule, {});
    assert.equal(result, true);
  } finally {
    delete process.env["JIG_HELPERS_TEST_EMPTY"];
  }
});

test("env.has returns false when the variable is not set", async () => {
  delete process.env["JIG_HELPERS_TEST_UNSET"];
  const result = await evaluate({ "env.has": ["JIG_HELPERS_TEST_UNSET"] } as JsonLogicRule, {});
  assert.equal(result, false);
});

// --- path namespace -------------------------------------------------------

test("path.join joins segments with the platform separator", async () => {
  const result = await evaluate({ "path.join": ["a", "b", "c"] } as JsonLogicRule, {});
  assert.equal(result, join("a", "b", "c"));
});

test("path.join returns null when any segment is non-string", async () => {
  const result = await evaluate({ "path.join": ["a", null, "c"] } as JsonLogicRule, {});
  assert.equal(result, null);
});

test("path.resolve returns an absolute path", async () => {
  const result = await evaluate({ "path.resolve": ["relative/thing"] } as JsonLogicRule, {});
  assert.equal(typeof result, "string");
  assert.ok((result as string).length > 0);
  // Must be absolute — starts with / on POSIX, drive letter on Windows.
  assert.ok(/^([/]|[A-Za-z]:)/.test(result as string));
});

test("path.dirname returns the parent directory", async () => {
  const result = await evaluate({ "path.dirname": ["/a/b/c.txt"] } as JsonLogicRule, {});
  assert.equal(result, "/a/b");
});

test("path.basename returns the last segment", async () => {
  const result = await evaluate({ "path.basename": ["/a/b/c.txt"] } as JsonLogicRule, {});
  assert.equal(result, "c.txt");
});

test("path.basename returns null on non-string input", async () => {
  const result = await evaluate({ "path.basename": [null] } as JsonLogicRule, {});
  assert.equal(result, null);
});

// --- os namespace ---------------------------------------------------------

test("os.platform returns the process platform", async () => {
  const result = await evaluate({ "os.platform": [] } as JsonLogicRule, {});
  assert.equal(result, nodePlatform());
});

test("os.arch returns the process arch", async () => {
  const result = await evaluate({ "os.arch": [] } as JsonLogicRule, {});
  assert.equal(result, nodeArch());
});

test("os.homedir returns the home directory", async () => {
  const result = await evaluate({ "os.homedir": [] } as JsonLogicRule, {});
  assert.equal(result, homedir());
});

test("os.tmpdir returns the tmp directory", async () => {
  const result = await evaluate({ "os.tmpdir": [] } as JsonLogicRule, {});
  assert.equal(result, tmpdir());
});

// --- time namespace -------------------------------------------------------

test("time.now returns a recent millisecond timestamp", async () => {
  const before = Date.now();
  const result = await evaluate({ "time.now": [] } as JsonLogicRule, {});
  const after = Date.now();
  assert.equal(typeof result, "number");
  assert.ok((result as number) >= before);
  assert.ok((result as number) <= after);
});

test("time.iso returns an ISO-8601 string", async () => {
  const result = await evaluate({ "time.iso": [] } as JsonLogicRule, {});
  assert.equal(typeof result, "string");
  // ISO-8601 sanity check: YYYY-MM-DDTHH:MM:SS.sssZ
  assert.match(result as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// --- composition ---------------------------------------------------------

test("helpers compose: file.exists(path.join(env.get(HOME), x))", async () => {
  // Uses a fixture path reachable from the repo root. Build up via
  // chained helpers to prove the async engine awaits nested calls.
  process.env["JIG_HELPERS_TEST_ROOT"] = FIXTURE_DIR;
  try {
    const rule: JsonLogicRule = {
      "file.exists": [
        {
          "path.join": [
            { "env.get": ["JIG_HELPERS_TEST_ROOT"] },
            "present.txt",
          ],
        },
      ],
    };
    assert.equal(await evaluate(rule, {}), true);
  } finally {
    delete process.env["JIG_HELPERS_TEST_ROOT"];
  }
});

// --- access controls ------------------------------------------------------

test("file.exists returns false for an absolute path outside the allowlist", async () => {
  // /etc is not in the allowlist — the PHP-era probe gets denied.
  const rule: JsonLogicRule = { "file.exists": ["/etc/passwd"] };
  assert.equal(await evaluate(rule, {}), false);
});

test("file.size returns null for an absolute path outside the allowlist", async () => {
  const rule: JsonLogicRule = { "file.size": ["/etc/passwd"] };
  assert.equal(await evaluate(rule, {}), null);
});

test("file.exists follows symlinks and denies escape from the allowlist", async () => {
  // Plant a symlink inside the allowed dir pointing outside it.
  const { symlinkSync, unlinkSync } = await import("node:fs");
  const linkPath = join(FIXTURE_DIR, "escape-link");
  try {
    // Clean up any stale link from a prior run.
    try { unlinkSync(linkPath); } catch { /* not there */ }
    symlinkSync("/etc/passwd", linkPath);
    const rule: JsonLogicRule = { "file.exists": [linkPath] };
    // Real path is /etc/passwd — outside allowlist → denied.
    assert.equal(await evaluate(rule, {}), false);
  } finally {
    try { unlinkSync(linkPath); } catch { /* ignore */ }
  }
});

test("env.get returns null for a var not matching the allowlist patterns", async () => {
  process.env["NOT_ALLOWED_VAR_ABCDEFG"] = "leaked";
  try {
    const result = await evaluate({ "env.get": ["NOT_ALLOWED_VAR_ABCDEFG"] } as JsonLogicRule, {});
    assert.equal(result, null);
  } finally {
    delete process.env["NOT_ALLOWED_VAR_ABCDEFG"];
  }
});

test("env.has returns false for a var not matching the allowlist patterns", async () => {
  process.env["NOT_ALLOWED_VAR_XYZ"] = "present";
  try {
    const result = await evaluate({ "env.has": ["NOT_ALLOWED_VAR_XYZ"] } as JsonLogicRule, {});
    assert.equal(result, false);
  } finally {
    delete process.env["NOT_ALLOWED_VAR_XYZ"];
  }
});

test("env.has matches wildcard patterns (JIG_HELPERS_TEST_* covers JIG_HELPERS_TEST_WILD)", async () => {
  process.env["JIG_HELPERS_TEST_WILD"] = "yes";
  try {
    const result = await evaluate({ "env.has": ["JIG_HELPERS_TEST_WILD"] } as JsonLogicRule, {});
    assert.equal(result, true);
  } finally {
    delete process.env["JIG_HELPERS_TEST_WILD"];
  }
});
