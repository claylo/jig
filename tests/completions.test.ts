import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/runtime/config.ts";

const BASE_WITH_PROMPT = `
version: "1"
server: { name: t, version: "0.0.1" }
prompts:
  - name: analyze_job
    arguments:
      - name: depth
        required: false
    template: "Analyze at {{depth}} depth."
tools: []
`;

const BASE_WITH_TEMPLATE = `
version: "1"
server: { name: t, version: "0.0.1" }
resources:
  - template: "queue://jobs/{status}"
    name: Jobs
    handler: { inline: { text: "[]" } }
tools: []
`;

test("config accepts a completions: block for a prompt argument", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      depth: [summary, detailed]
`;
  const cfg = parseConfig(yaml);
  assert.ok(cfg.completions, "completions present");
  assert.deepEqual(cfg.completions!.prompts!["analyze_job"]!["depth"], ["summary", "detailed"]);
});

test("config accepts a completions: block for a template variable", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://jobs/{status}":
      status: [pending, active, completed, failed]
`;
  const cfg = parseConfig(yaml);
  assert.ok(cfg.completions!.resources);
  assert.deepEqual(
    cfg.completions!.resources!["queue://jobs/{status}"]!["status"],
    ["pending", "active", "completed", "failed"],
  );
});

test("config accepts absent completions: block", () => {
  const cfg = parseConfig(BASE_WITH_PROMPT);
  assert.equal(cfg.completions, undefined);
});

test("config rejects completions.prompts referencing a non-existent prompt", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    no_such_prompt:
      depth: [x]
`;
  assert.throws(() => parseConfig(yaml), /completions\.prompts\.no_such_prompt.*not found/);
});

test("config rejects completions.prompts referencing a non-existent argument", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      no_such_arg: [x]
`;
  assert.throws(
    () => parseConfig(yaml),
    /completions\.prompts\.analyze_job\.no_such_arg.*not found/,
  );
});

test("config rejects completions.resources referencing a non-existent template", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://other/{foo}":
      foo: [x]
`;
  assert.throws(() => parseConfig(yaml), /completions\.resources.*queue:\/\/other\/\{foo\}.*not found/);
});

test("config rejects completions.resources referencing a non-existent variable", () => {
  const yaml = BASE_WITH_TEMPLATE + `
completions:
  resources:
    "queue://jobs/{status}":
      no_such_var: [x]
`;
  assert.throws(
    () => parseConfig(yaml),
    /completions\.resources.*no_such_var.*not a variable/,
  );
});

test("config rejects completions.prompts value that isn't an array", () => {
  const yaml = BASE_WITH_PROMPT + `
completions:
  prompts:
    analyze_job:
      depth: "not an array"
`;
  assert.throws(() => parseConfig(yaml), /must be an array/);
});

test("config rejects completions: that isn't a mapping", () => {
  const yaml = BASE_WITH_PROMPT + `
completions: [a, b]
`;
  assert.throws(() => parseConfig(yaml), /completions must be a mapping/);
});
