import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dirname!, "..", "src", "cli", "index.ts");
const NODE_ARGS = ["--experimental-transform-types", CLI_PATH];

function jig(args: string[], options?: { cwd?: string }): string {
  return execFileSync(process.execPath, [...NODE_ARGS, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    cwd: options?.cwd,
    env: { ...process.env },
  });
}

function jigFails(args: string[], options?: { cwd?: string }): string {
  try {
    execFileSync(process.execPath, [...NODE_ARGS, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      cwd: options?.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.fail("expected command to fail");
    return "";
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string };
    return (e.stderr ?? "") + (e.stdout ?? "");
  }
}

// --- help ---

test("cli: --help shows usage", () => {
  const out = jig(["--help"]);
  assert.ok(out.includes("jig <command>"));
  assert.ok(out.includes("validate"));
  assert.ok(out.includes("build"));
});

test("cli: unknown command exits 1", () => {
  const out = jigFails(["bogus"]);
  assert.ok(out.includes('unknown command "bogus"'));
});

// --- validate ---

test("cli: validate succeeds on valid config", () => {
  const out = jig(["validate", "examples/minimal.yaml"]);
  assert.ok(out.includes("ok:"));
  assert.ok(out.includes("1 tool"));
});

test("cli: validate reports tool/resource/prompt/task counts", () => {
  const out = jig(["validate", "examples/tasks.yaml"]);
  assert.ok(out.includes("1 tool"));
  assert.ok(out.includes("1 task"));
});

test("cli: validate fails on bad config", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  writeFileSync(join(dir, "bad.yaml"), "not_a_valid_config: true\n");
  try {
    const out = jigFails(["validate", join(dir, "bad.yaml")]);
    assert.ok(out.includes("error:"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: validate with no args shows usage", () => {
  const out = jigFails(["validate"]);
  assert.ok(out.includes("missing config path"));
});

// --- new ---

test("cli: new creates jig.yaml from minimal template", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  try {
    const out = jig(["new"], { cwd: dir });
    assert.ok(out.includes("ok:"));
    assert.ok(existsSync(join(dir, "jig.yaml")));
    const content = readFileSync(join(dir, "jig.yaml"), "utf8");
    assert.ok(content.includes('version: "1"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: new with named template", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  try {
    const out = jig(["new", "dispatcher"], { cwd: dir });
    assert.ok(out.includes("dispatcher"));
    const content = readFileSync(join(dir, "jig.yaml"), "utf8");
    assert.ok(content.includes("dispatch"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: new refuses to overwrite existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  writeFileSync(join(dir, "jig.yaml"), "existing\n");
  try {
    const out = jigFails(["new"], { cwd: dir });
    assert.ok(out.includes("already exists"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: new --list shows available templates", () => {
  const out = jig(["new", "--list"]);
  assert.ok(out.includes("minimal"));
  assert.ok(out.includes("dispatcher"));
});

test("cli: new with unknown template fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  try {
    const out = jigFails(["new", "nonexistent"], { cwd: dir });
    assert.ok(out.includes("unknown template"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- build ---

test("cli: build produces working .mjs from config", { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  const outPath = join(dir, "server.mjs");
  try {
    const out = jig(["build", "examples/minimal.yaml", "-o", outPath]);
    assert.ok(out.includes("ok:"));
    assert.ok(existsSync(outPath));

    // Verify the built file runs and responds to initialize.
    const rpc = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1" },
      },
    });
    const response = execFileSync("node", [outPath], {
      input: rpc + "\n",
      encoding: "utf8",
      timeout: 10_000,
    });
    const parsed = JSON.parse(response.split("\n")[0]!);
    assert.equal(parsed.result.serverInfo.name, "jig-minimal");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: build --bare produces .mjs that reads sibling yaml", { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  const outPath = join(dir, "server.mjs");
  try {
    jig(["build", "--bare", "-o", outPath]);
    assert.ok(existsSync(outPath));

    // Copy a config as sibling.
    const exampleYaml = readFileSync("examples/minimal.yaml", "utf8");
    writeFileSync(join(dir, "jig.yaml"), exampleYaml);

    const rpc = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1" },
      },
    });
    const response = execFileSync("node", [outPath], {
      input: rpc + "\n",
      encoding: "utf8",
      timeout: 10_000,
    });
    const parsed = JSON.parse(response.split("\n")[0]!);
    assert.equal(parsed.result.serverInfo.name, "jig-minimal");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: build fails on invalid config", () => {
  const dir = mkdtempSync(join(tmpdir(), "jig-cli-"));
  writeFileSync(join(dir, "bad.yaml"), "not_valid: true\n");
  try {
    const out = jigFails(["build", join(dir, "bad.yaml"), "-o", join(dir, "out.mjs")]);
    assert.ok(out.includes("validation failed"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: build without -o shows error", () => {
  const out = jigFails(["build", "examples/minimal.yaml"]);
  assert.ok(out.includes("--output is required"));
});
