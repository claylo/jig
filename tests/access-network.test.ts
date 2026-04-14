import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configureAccess,
  isHostAllowed,
  resetAccessForTests,
} from "../src/runtime/util/access.ts";

test("isHostAllowed denies every host before configureAccess runs", () => {
  resetAccessForTests();
  assert.equal(isHostAllowed("api.linear.app"), false);
});

test("isHostAllowed honors an explicit network.allow list", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["api.linear.app"] } },
    process.cwd(),
  );
  assert.equal(isHostAllowed("api.linear.app"), true);
  assert.equal(isHostAllowed("evil.com"), false);
});

test("isHostAllowed supports * wildcards", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["*.github.com", "*.foo.example"] } },
    process.cwd(),
  );
  assert.equal(isHostAllowed("api.github.com"), true);
  assert.equal(isHostAllowed("raw.github.com"), true);
  assert.equal(isHostAllowed("github.com"), false); // * requires at least one char
  assert.equal(isHostAllowed("bar.foo.example"), true);
  // Patterns are case-insensitive per RFC 1035; allowlist string
  // gets lowercased at compile time to match URL.hostname semantics.
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["*.MIXED.case"] } },
    process.cwd(),
  );
  assert.equal(isHostAllowed("api.mixed.case"), true);
});

test("isHostAllowed infers the allowlist from connections when network.allow is unset", () => {
  resetAccessForTests();
  configureAccess(
    {},
    process.cwd(),
    {
      linear_api: { url: "https://api.linear.app/graphql" },
      gh_api: { url: "https://api.github.com" },
    },
  );
  assert.equal(isHostAllowed("api.linear.app"), true);
  assert.equal(isHostAllowed("api.github.com"), true);
  assert.equal(isHostAllowed("evil.com"), false);
});

test("isHostAllowed denies everything when neither network.allow nor connections are declared", () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  assert.equal(isHostAllowed("api.linear.app"), false);
  assert.equal(isHostAllowed("localhost"), false);
});

test("explicit network.allow replaces (does not merge) the inferred list", () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["webhook.example.com"] } },
    process.cwd(),
    { linear_api: { url: "https://api.linear.app/graphql" } },
  );
  assert.equal(isHostAllowed("webhook.example.com"), true);
  // linear's host is NOT auto-included once explicit allow is set.
  assert.equal(isHostAllowed("api.linear.app"), false);
});

test(
  "boot fails when network.allow excludes a declared connection",
  { timeout: 10_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-access-"));
    const configPath = join(dir, "jig.yaml");
    writeFileSync(
      configPath,
      `server:
  name: t
  version: "0.0.1"
  security:
    network:
      allow: ["webhook.example.com"]
connections:
  linear_api:
    url: https://api.linear.app/graphql
tools: []
`,
    );
    try {
      const child = spawn(
        process.execPath,
        [
          "--experimental-transform-types",
          join(process.cwd(), "src/runtime/index.ts"),
          "--config",
          configPath,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c) => (stderr += c));
      const code = await new Promise<number | null>((res) => child.on("close", res));
      assert.equal(code, 1);
      assert.match(stderr, /connections\.linear_api.*api\.linear\.app.*network\.allow/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
);
