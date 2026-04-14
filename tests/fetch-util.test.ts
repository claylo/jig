import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { performFetch } from "../src/runtime/util/fetch.ts";
import {
  configureAccess,
  resetAccessForTests,
} from "../src/runtime/util/access.ts";

async function startFixture(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((res) => server.close(() => res())),
  };
}

test("performFetch denies when the host is not allowed", async () => {
  resetAccessForTests();
  configureAccess({}, process.cwd());
  const result = await performFetch({
    method: "GET",
    url: "http://127.0.0.1:1/",
    headers: {},
    responseMode: "body",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /host "127\.0\.0\.1" not in/);
});

test("performFetch returns body text on 2xx in body mode", async () => {
  resetAccessForTests();
  configureAccess(
    { network: { allow: ["127.0.0.1"] } },
    process.cwd(),
  );
  const fixture = await startFixture((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("hello");
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/",
      headers: {},
      responseMode: "body",
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0]!.text, "hello");
  } finally {
    await fixture.close();
  }
});

test("performFetch flips isError on 4xx with the status in the message", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/missing",
      headers: {},
      responseMode: "body",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /returned 404: not found/);
  } finally {
    await fixture.close();
  }
});

test("performFetch returns an envelope in envelope mode", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    res.writeHead(201, { "Content-Type": "application/json", "X-Trace": "abc" });
    res.end('{"ok":true}');
  });
  try {
    const result = await performFetch({
      method: "POST",
      url: fixture.url + "/",
      headers: {},
      responseMode: "envelope",
    });
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text) as {
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    assert.equal(parsed.status, 201);
    assert.equal(parsed.headers["x-trace"], "abc");
    assert.equal(parsed.body, '{"ok":true}');
  } finally {
    await fixture.close();
  }
});

test("performFetch keeps envelope success-shaped on 4xx responses", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/missing",
      headers: {},
      responseMode: "envelope",
    });
    // Envelope mode never flips isError on 4xx/5xx — author branches in transform.
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0]!.text) as {
      status: number;
      body: string;
    };
    assert.equal(parsed.status, 404);
    assert.equal(parsed.body, "not found");
  } finally {
    await fixture.close();
  }
});

test("performFetch errors on timeout", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  const fixture = await startFixture((_req, res) => {
    // Never respond — let the client abort.
    setTimeout(() => {
      res.writeHead(200);
      res.end("late");
    }, 2000);
  });
  try {
    const result = await performFetch({
      method: "GET",
      url: fixture.url + "/",
      headers: {},
      responseMode: "body",
      timeoutMs: 50,
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /timeout|aborted/i);
  } finally {
    await fixture.close();
  }
});

test("performFetch forwards the method, URL, and headers", async () => {
  resetAccessForTests();
  configureAccess({ network: { allow: ["127.0.0.1"] } }, process.cwd());
  let seen: { method?: string; url?: string; hdr?: string } = {};
  const fixture = await startFixture((req, res) => {
    seen = {
      method: req.method,
      url: req.url,
      hdr: req.headers["x-test"] as string | undefined,
    };
    res.writeHead(200);
    res.end("ok");
  });
  try {
    await performFetch({
      method: "PUT",
      url: fixture.url + "/things?a=1",
      headers: { "X-Test": "t" },
      body: "payload",
      responseMode: "body",
    });
    assert.equal(seen.method, "PUT");
    assert.equal(seen.url, "/things?a=1");
    assert.equal(seen.hdr, "t");
  } finally {
    await fixture.close();
  }
});
