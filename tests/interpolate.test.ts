import { test } from "node:test";
import assert from "node:assert/strict";
import { expandShim, expandShimInTree } from "../src/runtime/util/interpolate.ts";

test("expandShim returns the literal string when there are no ${...} tokens", () => {
  assert.equal(expandShim("https://api.linear.app/graphql"), "https://api.linear.app/graphql");
  assert.equal(expandShim(""), "");
  assert.equal(expandShim("Bearer"), "Bearer");
});

test("expandShim returns a bare env.get rule for a single ${VAR} with no surrounding text", () => {
  assert.deepEqual(expandShim("${LINEAR_API_TOKEN}"), {
    "env.get": ["LINEAR_API_TOKEN"],
  });
});

test("expandShim wraps single-token-with-prefix in cat", () => {
  assert.deepEqual(expandShim("Bearer ${LINEAR_API_TOKEN}"), {
    cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
  });
});

test("expandShim handles multi-token composition", () => {
  assert.deepEqual(
    expandShim("${JIG_PROTOCOL}://${JIG_HOST}:${JIG_PORT}"),
    {
      cat: [
        { "env.get": ["JIG_PROTOCOL"] },
        "://",
        { "env.get": ["JIG_HOST"] },
        ":",
        { "env.get": ["JIG_PORT"] },
      ],
    },
  );
});

test("expandShim leaves malformed tokens literal", () => {
  // digit-leading name is invalid shell identifier — pass through.
  assert.equal(expandShim("${1BAD}"), "${1BAD}");
  // unclosed ${ — pass through.
  assert.equal(expandShim("${OPEN"), "${OPEN");
  // literal $ with no { — pass through.
  assert.equal(expandShim("price: $5"), "price: $5");
});

test("expandShim handles mixed literal and valid token", () => {
  // only the valid token expands; literal $ survives.
  assert.deepEqual(expandShim("$5 fee + ${REGION}"), {
    cat: ["$5 fee + ", { "env.get": ["REGION"] }],
  });
});

test("expandShimInTree expands strings inside a nested object", () => {
  const input = {
    url: "https://api.linear.app/graphql",
    headers: {
      Authorization: "Bearer ${LINEAR_API_TOKEN}",
      "X-Org": "${JIG_ORG}",
    },
    timeout_ms: 30000,
  };
  const result = expandShimInTree(input);
  assert.deepEqual(result, {
    url: "https://api.linear.app/graphql",
    headers: {
      Authorization: {
        cat: ["Bearer ", { "env.get": ["LINEAR_API_TOKEN"] }],
      },
      "X-Org": { "env.get": ["JIG_ORG"] },
    },
    timeout_ms: 30000,
  });
});

test("expandShimInTree walks arrays", () => {
  const result = expandShimInTree([
    "literal",
    "${A}",
    ["${B}", 42],
  ]);
  assert.deepEqual(result, [
    "literal",
    { "env.get": ["A"] },
    [{ "env.get": ["B"] }, 42],
  ]);
});

test("expandShim preserves unicode in literal segments around a token", () => {
  assert.deepEqual(expandShim("héllo ${REGION}"), {
    cat: ["héllo ", { "env.get": ["REGION"] }],
  });
});

test("expandShim handles adjacent tokens with no separator", () => {
  assert.deepEqual(expandShim("${A}${B}"), {
    cat: [{ "env.get": ["A"] }, { "env.get": ["B"] }],
  });
});
