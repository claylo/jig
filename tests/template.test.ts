import { test } from "node:test";
import assert from "node:assert/strict";
import { render, renderUriEncoded } from "../src/runtime/util/template.ts";

test("render substitutes a single variable", () => {
  assert.equal(render("hello {{name}}", { name: "world" }), "hello world");
});

test("render treats missing variables as empty string", () => {
  assert.equal(render("hello {{name}}", {}), "hello ");
});

test("render tolerates whitespace inside the braces", () => {
  assert.equal(render("{{ name }}", { name: "world" }), "world");
});

test("render resolves nested dot-paths", () => {
  assert.equal(
    render("{{a.b.c}}", { a: { b: { c: "deep" } } }),
    "deep",
  );
});

test("render returns empty string for a partial dot-path miss", () => {
  assert.equal(render("{{a.b.c}}", { a: { b: {} } }), "");
});

test("render stringifies numbers and booleans", () => {
  assert.equal(render("{{n}} / {{b}}", { n: 42, b: true }), "42 / true");
});

test("render JSON-stringifies objects and arrays", () => {
  assert.equal(
    render("{{o}}", { o: { x: 1 } }),
    '{"x":1}',
  );
  assert.equal(
    render("{{a}}", { a: [1, 2, 3] }),
    "[1,2,3]",
  );
});

test("render leaves literal text unchanged when no tokens are present", () => {
  assert.equal(render("no tokens here", { unused: "x" }), "no tokens here");
});

test("render substitutes the same token multiple times", () => {
  assert.equal(render("{{x}}-{{x}}", { x: "a" }), "a-a");
});

test("render leaves unclosed braces as literal text", () => {
  assert.equal(render("hello {{name", { name: "ignored" }), "hello {{name");
});

// ─── renderUriEncoded ────────────────────────────────────────────────

test("renderUriEncoded encodes path traversal in interpolated values", () => {
  assert.equal(
    renderUriEncoded("/items/{{id}}", { id: "../admin" }),
    "/items/..%2Fadmin",
  );
});

test("renderUriEncoded encodes query characters in interpolated values", () => {
  assert.equal(
    renderUriEncoded("/items/{{id}}", { id: "foo?bar=baz" }),
    "/items/foo%3Fbar%3Dbaz",
  );
});

test("renderUriEncoded leaves literal path text unchanged", () => {
  assert.equal(
    renderUriEncoded("/items/{{id}}/details", { id: "123" }),
    "/items/123/details",
  );
});

test("renderUriEncoded encodes spaces in interpolated values", () => {
  assert.equal(
    renderUriEncoded("/search/{{q}}", { q: "hello world" }),
    "/search/hello%20world",
  );
});

test("renderUriEncoded does not double-encode literal percent signs", () => {
  assert.equal(
    renderUriEncoded("/path%20with/{{id}}", { id: "ok" }),
    "/path%20with/ok",
  );
});
