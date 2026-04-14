import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/runtime/util/template.ts";

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
