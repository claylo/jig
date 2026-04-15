import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

test("config accepts a prompts: block with a single prompt", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: analyze_job
    description: Analyze a completed job
    arguments:
      - name: jobId
        description: The job ID
        required: true
      - name: depth
        description: "summary | detailed"
        required: false
    template: "Analyze job {{jobId}} at {{depth}} depth."
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.ok(cfg.prompts, "prompts must be present");
  assert.equal(cfg.prompts.length, 1);
  const p = cfg.prompts[0]!;
  assert.equal(p.name, "analyze_job");
  assert.equal(p.description, "Analyze a completed job");
  assert.equal(p.template, "Analyze job {{jobId}} at {{depth}} depth.");
  assert.equal(p.arguments!.length, 2);
  assert.equal(p.arguments![0]!.name, "jobId");
  assert.equal(p.arguments![0]!.required, true);
  assert.equal(p.arguments![1]!.required, false);
});

test("config accepts prompts: with no arguments array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: simple
    template: "Just a template."
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.prompts!.length, 1);
  assert.equal(cfg.prompts![0]!.arguments, undefined);
});

test("config accepts absent prompts: block", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
tools: []
`;
  const cfg = parseConfig(yamlText);
  assert.equal(cfg.prompts, undefined);
});

test("config rejects prompts: that isn't an array", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  not_an_array: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts must be an array/);
});

test("config rejects a prompt missing name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - description: No name
    template: "x"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.name is required/);
});

test("config rejects a prompt with an empty name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: ""
    template: "x"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.name is required/);
});

test("config rejects a prompt missing template", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: no_template
    description: "missing template"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.template is required/);
});

test("config rejects duplicate prompt names", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: dup
    template: "a"
  - name: dup
    template: "b"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /duplicate prompt name "dup"/);
});

test("config rejects a prompt with an unknown top-level key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    bogus: 42
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]: unknown key "bogus"/);
});

test("config rejects an argument missing name", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - description: "no name here"
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.arguments\[0\]\.name is required/);
});

test("config rejects duplicate argument names within a prompt", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - name: depth
      - name: depth
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]: duplicate argument name "depth"/);
});

test("config rejects an argument with an unknown key", () => {
  const yamlText = `
server: { name: t, version: "0.0.1" }
prompts:
  - name: foo
    template: "x"
    arguments:
      - name: x
        sneaky: true
tools: []
`;
  assert.throws(() => parseConfig(yamlText), /prompts\[0\]\.arguments\[0\]: unknown key "sneaky"/);
});
