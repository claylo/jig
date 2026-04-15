import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a probes: block with a single graphql probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections:
  api:
    url: https://example.com
probes:
  teams:
    graphql:
      connection: api
      query: "{ teams { name } }"
tools:
  - name: t1
    description: x
    handler:
      inline:
        text: ok
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes, "probes must be present");
  const p = cfg.probes["teams"];
  assert.ok(p, "teams probe must be present");
  assert.equal((p.handler as { graphql: { connection: string } }).graphql.connection, "api");
});

test("config accepts http and exec probes", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  status:
    http:
      connection: api
      method: GET
      path: /status
  git_sha:
    exec: "git rev-parse HEAD"
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.probes!["status"]?.handler);
  assert.equal((cfg.probes!["git_sha"]?.handler as { exec: string }).exec, "git rev-parse HEAD");
});

test("config rejects a probe with no handler", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  bare:
    timeout_ms: 1000
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /must declare exactly one of graphql, http, exec \(got none\)/);
});

test("config rejects a probe with two handlers", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
connections: { api: { url: https://example.com } }
probes:
  conflicted:
    http: { connection: api, method: GET }
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /got http, exec/);
});

test("config rejects an unknown key in a probe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  weird:
    exec: "echo hi"
    bogus: 42
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probes\.weird: unknown key "bogus"/);
});

test("config rejects probe names that aren't Mustache-safe", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  "bad.name":
    exec: "echo hi"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /probe names must match/);
});

test("config rejects negative timeout_ms", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  slow:
    exec: "echo hi"
    timeout_ms: -1
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /timeout_ms must be a positive number/);
});

test("config accepts a probe with a map: rule (no structural check at parse time)", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  shaped:
    exec: "echo hi"
    map:
      var: "result"
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.deepEqual(cfg.probes!["shaped"]?.map, { var: "result" });
});

test("config accepts a server with no probes block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools:
  - name: t1
    description: x
    handler: { inline: { text: ok } }
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.probes, undefined);
});

test("config rejects probes: null at the top level", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: ~
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects probes: as an array at the top level", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: []
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects probes: as a scalar string", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes: "oops"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes must be a mapping/);
});

test("config rejects a probe entry that is null", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  broken: ~
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes\.broken must be a mapping/);
});

test("config rejects a probe entry that is an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
probes:
  broken: []
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /config: probes\.broken must be a mapping/);
});

import { resolveProbes } from "../src/runtime/probes.ts";
import { compileConnections } from "../src/runtime/connections.ts";
import { configureAccess, resetAccessForTests } from "../src/runtime/util/access.ts";
import { createServer as createHttpServerProbes } from "node:http";
import type { AddressInfo as AddressInfoProbes } from "node:net";

async function startProbeFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createHttpServerProbes(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfoProbes).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test("resolveProbes resolves a single graphql probe to its data field", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startProbeFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { teams: [{ name: "Eng" }] } }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await resolveProbes(
      {
        teams: {
          handler: { graphql: { connection: "api", query: "{ teams { name } }" } },
        },
      },
      compiled,
    );
    // Default graphql data mode returns the JSON-stringified data field.
    const parsed = JSON.parse(result["teams"] as string) as { teams: { name: string }[] };
    assert.equal(parsed.teams[0]!.name, "Eng");
  } finally {
    await fix.close();
  }
});

test("resolveProbes resolves an exec probe to its stdout", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  const result = await resolveProbes(
    { greeting: { handler: { exec: "echo hello" } } },
    {},
  );
  assert.match(String(result["greeting"]), /hello/);
});

test("resolveProbes applies map: to shape the response", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fix = await startProbeFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { teams: [{ name: "Eng" }, { name: "Ops" }] } }));
  });
  try {
    const compiled = compileConnections({ api: { url: fix.url } });
    const result = await resolveProbes(
      {
        team_names: {
          handler: { graphql: { connection: "api", query: "{ teams { name } }" } },
          // Map walks through the JSON-stringified graphql data-mode result;
          // the resolver pre-parses, so map sees the parsed object.
          map: { map: [{ var: "result.teams" }, { var: "name" }] },
        },
      },
      compiled,
    );
    assert.deepEqual(result["team_names"], ["Eng", "Ops"]);
  } finally {
    await fix.close();
  }
});

test("resolveProbes returns raw text when map: is absent", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  // No map: — the resolver early-returns the handler's raw text without
  // attempting JSON.parse.
  const result = await resolveProbes(
    { plain: { handler: { exec: "echo plain text here" } } },
    {},
  );
  assert.match(String(result["plain"]), /plain text here/);
});

test("resolveProbes passes raw string to map: when response is not JSON", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  // map: is present AND handler returns non-JSON text — exercises the
  // JSON.parse fallback in resolveOne. `{ var: "result" }` passes the raw
  // string through unchanged.
  const result = await resolveProbes(
    {
      plain_mapped: {
        handler: { exec: "echo not json here" },
        map: { var: "result" },
      },
    },
    {},
  );
  assert.match(String(result["plain_mapped"]), /not json here/);
});

test("resolveProbes returns empty object when probes is undefined or empty", async () => {
  assert.deepEqual(await resolveProbes(undefined, {}), {});
  assert.deepEqual(await resolveProbes({}, {}), {});
});

import { spawn } from "node:child_process";

interface SubprocResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

function runResolveSubprocess(driverScript: string, timeoutMs = 10_000): Promise<SubprocResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "--input-type=module", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("subprocess timeout"));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
    child.stdin.write(driverScript);
    child.stdin.end();
  });
}

test(
  "resolveProbes exits 1 on a per-probe timeout",
  { timeout: 15_000 },
  async () => {
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  { slow: { handler: { exec: "sleep 5" }, timeout_ms: 50 } },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 1 probe/);
    assert.match(r.stderr, /probe "slow":/);
    assert.match(r.stderr, /timed out after 50ms/);
    assert.doesNotMatch(r.stdout, /UNREACHABLE/);
  },
);

test(
  "resolveProbes exits 1 on a handler isError result",
  { timeout: 15_000 },
  async () => {
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  { broken: { handler: { exec: "this-command-does-not-exist-xyz" } } },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 1 probe/);
    assert.match(r.stderr, /probe "broken":/);
    assert.doesNotMatch(r.stdout, /UNREACHABLE/);
  },
);

test(
  "resolveProbes lists every failure when multiple probes fail",
  { timeout: 15_000 },
  async () => {
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  {
    a: { handler: { exec: "this-command-does-not-exist-aaa" } },
    b: { handler: { exec: "this-command-does-not-exist-bbb" } },
  },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe resolution failed for 2 probes/);
    assert.match(r.stderr, /probe "a":/);
    assert.match(r.stderr, /probe "b":/);
  },
);

test(
  "resolveProbes exits 1 when map: throws",
  { timeout: 15_000 },
  async () => {
    // Use an operator that throws on bad input — divide by string.
    const driver = `
import { resolveProbes } from "${process.cwd()}/src/runtime/probes.ts";
import { configureAccess, resetAccessForTests } from "${process.cwd()}/src/runtime/util/access.ts";
resetAccessForTests();
configureAccess({}, process.cwd());
await resolveProbes(
  {
    bad_map: {
      handler: { exec: "echo hi" },
      map: { "/": [{ var: "result" }, 0] },
    },
  },
  {},
);
console.log("UNREACHABLE");
`;
    const r = await runResolveSubprocess(driver);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /probe "bad_map":/);
    assert.match(r.stderr, /map: rule failed/);
  },
);
