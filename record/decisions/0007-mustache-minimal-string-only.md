---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0007: Minimal Mustache — string interpolation only, no logic

## Context and Problem Statement

Plan 2 needs string interpolation so exec commands, URLs, and (later) HTTP bodies can reference `tools/call` arguments. Full Mustache supports sections, conditionals, partials, and lambdas. Which subset should jig's renderer implement?

## Decision Drivers

- JSONLogic (Plan 3) covers conditional logic; Mustache sections would duplicate that surface.
- Bundle size matters — jig ships inside every built `.mjs`; a full Mustache library costs roughly 10–15 KB we don't need.
- Authors reaching for Mustache sections in YAML are usually signaling that the logic belongs in a `compute:` handler or a guard.
- Hand-rolled renderers are auditable; a vendored library isn't.

## Considered Options

- **Full Mustache (`mustache` on npm).** All features, external dependency.
- **Minimal hand-rolled `{{var}}` + `{{a.b.c}}` only** (chosen).
- **JSONLogic with string-template operator.** Force every interpolation through JSONLogic.

## Decision Outcome

Chosen: **Minimal hand-rolled renderer**.

- `{{var}}` and `{{a.b.c}}` dot-paths.
- Missing values render as empty string.
- Primitives via `String()`; objects and arrays via `JSON.stringify`.
- Unclosed braces render as literal text — the renderer never throws.
- No HTML escaping; no sections, conditionals, partials, lambdas.

### Consequences

- Good, because bundle size stays close to zero for the templating surface.
- Good, because the behavior is fully specified in one file.
- Good, because authors who reach for logic get redirected to JSONLogic (Plan 3) where it belongs.
- Bad, because authors who already know full Mustache syntax will try `{{#each}}` and get literal-text output. Documentation has to name the subset explicitly.
- Bad, because jig now owns a templating surface; any future ambiguity is our problem.

### Confirmation

Tests in `tests/template.test.ts` cover the surface: missing values, nested paths, primitives and objects, multiple substitutions, unclosed braces. Any future expansion (e.g., loops over `probe` arrays) requires its own ADR.
