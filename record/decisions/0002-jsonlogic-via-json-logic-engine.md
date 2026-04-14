---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0002: JSONLogic via json-logic-engine for declarative conditional logic

## Context and Problem Statement

Jig's YAML surface needs two things that a string templating language alone cannot safely deliver: **guards** on state-machine transitions and tool dispatch, and **transforms** on probe and handler responses. Authors must be able to write expressions like "only allow this transition when `result.valid` is true" or "shape this GraphQL response into a flatter structure for interpolation." How do we express that logic inside `jig.yaml` without inviting a full scripting language into every server bundle?

The constraint is sharp: YAML is the canonical authoring format, `server.mjs` is the only runtime artifact, and every kilobyte we ship rides along in every produced server. Whatever we pick is paid for by every jig user forever.

## Decision Drivers

- **Declarative over imperative.** Authors describe *what* should be true, not *how* to compute it. No loops, no variables, no arbitrary code paths.
- **No code execution surface.** Every `jig.yaml` is a trust boundary. A scripting engine turns YAML into a code-execution target; a rules engine does not.
- **Embeds natively in YAML.** JSONLogic rules are JSON objects, and YAML is a JSON superset — rules parse as YAML nodes with no escaping, no string serialization, no quoting gymnastics.
- **Async evaluation.** Guards must be able to hit disk, HTTP, or a database before deciding. A sync-only engine forces side-effect logic into handlers, which defeats the point of declarative guards.
- **Active maintenance.** We are shipping this in every binary for years. Stagnant libraries become our problem.

## Considered Options

- **JSONLogic via `json-logic-engine` v5** — JIT-compiling rules engine with sync and async execution modes and a custom operator registry.
- **JSONLogic via `json-logic-js`** — the original JSONLogic library; sync-only interpreter.
- **Mustache-only, no logic layer** — lean on string templating plus whatever branching authors can bolt onto `exec:` commands.
- **Embedded JavaScript evaluation** — let authors write `() => input.priority > 0` directly in YAML.
- **CEL (Common Expression Language)** — Google's expression language, as used in Kubernetes and IAM policies.

## Decision Outcome

Chosen option: **JSONLogic via `json-logic-engine` v5**, because it is the only option that delivers declarative logic, native YAML embedding, async evaluation, and a custom operator registry in a single package — with active maintenance through 2025 and a compile-to-function step that brings rule evaluation within an order of magnitude of handwritten code.

We split templating into two explicit layers as a consequence of this decision:

- **Mustache `{{var.path}}`** — string interpolation only. Command lines, URLs, descriptions, error messages.
- **JSONLogic** — conditional logic only. Guards (`when:`), transforms (`transform:`, `map:`), state transitions.

The custom operator registry exposes named runtime functions that YAML can call directly:

```javascript
// In jig's runtime
engine.addMethod("queue.length", async () => queue.length);
```

```yaml
when: { ">": [{ "queue.length": [] }, 0] }
```

A real workflow uses the same shape for state transitions:

```yaml
on:
  - event: validation_passed
    target: executing
    when: { "var": "result.valid" }
  - event: needs_approval
    target: awaiting_approval
    when: { "==": [{ "var": "result.status" }, "needs_approval"] }
```

### Consequences

- Good, because JSONLogic rules embed in YAML with zero escaping — `{ "==": [{ "var": "x" }, 1] }` is valid YAML and valid JSON simultaneously.
- Good, because async operators let guards hit disk, HTTP, and databases before deciding, covering the guard-with-side-effects case that pure-sync engines force into handlers.
- Good, because the custom operator registry gives jig a clean extension point — runtime capabilities (queue length, probe values, connection health) become first-class YAML primitives via `engine.addMethod(...)`.
- Good, because rules are declarative data: they can be linted, statically analyzed, and explained in error messages far more usefully than arbitrary code.
- Good, because `json-logic-engine` compiles rules to native JavaScript functions, which keeps evaluation cost negligible on hot paths like per-request dispatch guards.
- Bad, because the engine adds roughly 500 KB to every produced server binary — a real cost paid by every jig user, not absorbed at the author's desk.
- Bad, because JSONLogic's syntax is verbose compared to an expression language (`{ ">": [{ "var": "x" }, 0] }` versus `x > 0`); authors will grumble on complex guards.
- Bad, because we now maintain two templating layers with separate documentation, error surfaces, and author mental models — two things to learn and two things to debug.

### Confirmation

We verify the decision in three ways:

1. **Bundle audit.** `jig build` reports the final bundle size; the JSONLogic contribution stays within the 500 KB envelope as the engine evolves.
2. **Expressiveness check.** Every guard, transform, and transition in the first real jig user's YAML compiles and evaluates correctly without falling back to `exec:` for logic.
3. **Security review.** No path in the runtime passes author YAML to `eval`, `Function`, `vm.runInNewContext`, or equivalent. JSONLogic stays the only logic-evaluation surface.

## Pros and Cons of the Options

### JSONLogic via `json-logic-engine` v5

JIT-compiling JSONLogic engine with sync and async execution modes, custom operator registry, and active maintenance.

- Good, because async operators let guards perform real work before deciding — disk reads, HTTP calls, database queries.
- Good, because rule compilation to native JS functions yields roughly a 2x performance improvement over `json-logic-rs` and a much larger margin over interpreted engines.
- Good, because active maintenance through 2025 reduces the long-tail risk of shipping it in every binary.
- Neutral, because the ~500 KB footprint is measurable but modest relative to the MCP SDK, YAML parser, and runtime already in the bundle.
- Bad, because learning two syntactic layers (Mustache + JSONLogic) raises the authoring learning curve.

### JSONLogic via `json-logic-js`

The original JSONLogic library — sync-only interpreter, smaller footprint, fewer features.

- Good, because it is the reference implementation, widely understood, and the syntax is identical to `json-logic-engine`.
- Good, because the bundle footprint is smaller than the compiling engine.
- Bad, because it is sync-only — guards that need to hit disk, HTTP, or a database must be lifted out of the rule layer and into handler code, defeating the declarative design.
- Bad, because it interprets rules on every evaluation rather than compiling them, which costs more on hot paths.
- Bad, because maintenance cadence has been slower; we would be banking on a library we may end up forking.

### Mustache-only, no logic layer

Skip JSONLogic entirely. Use Mustache for strings and push conditional logic into `exec:` commands.

- Good, because the bundle is smaller and the author's mental model is one layer, not two.
- Good, because Mustache is already in the bundle for string interpolation — no additional dependency.
- Bad, because Mustache has no branching. Authors reach for shell conditionals inside `exec:` handlers, which is a worse security surface (`exec` injection) and worse ergonomics (bash syntax errors at runtime rather than schema-time).
- Bad, because state-machine transitions *require* guards. Without JSONLogic, the `tasks:` feature either regresses to unconditional transitions or invents a bespoke micro-DSL for `when:` — both worse than adopting a proven rules language.

### Embedded JavaScript evaluation

Let authors write JS expressions directly: `when: "() => input.priority > 0"`.

- Good, because JavaScript is the most expressive option and authors already know the language.
- Bad, because every `jig.yaml` becomes a code-execution target. Sibling YAML (`extension_points:`), plugin marketplaces, and shared workflows all turn hostile-input.
- Bad, because arbitrary code in a rules slot defeats static analysis — we cannot lint, budget, or explain these guards before evaluation.
- Bad, because sandboxing JavaScript reliably in Node requires `vm` isolates or workers, both of which add complexity and runtime cost that exceed the entire JSONLogic engine.

### CEL (Common Expression Language)

Google's expression language, used in Kubernetes admission control and IAM policies.

- Good, because CEL is a mature, well-specified expression language with formal semantics.
- Good, because the syntax (`input.priority > 0`) is more compact than JSONLogic's JSON form.
- Bad, because CEL does not embed natively in YAML — expressions live inside quoted strings, reintroducing the escaping problems we chose JSONLogic to avoid.
- Bad, because the Node CEL ecosystem is small and less proven than JSONLogic in Node; the mature CEL implementations are in Go, Java, and C++.
- Bad, because CEL's grammar is larger than JSONLogic's, which raises both the bundle cost and the surface we would need to document, error-message, and validate against.

## More Information

- Design doc: [`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md) — see "Templating: two layers" and "Alternatives considered" for the full context.
- Related: ADR-0001 (single-file ESM `.mjs` output) — the bundle-size constraint that makes the 500 KB trade-off a conscious cost rather than a free choice.
- `json-logic-engine` v5: <https://github.com/TotalTechGeek/json-logic-engine>
- JSONLogic reference: <https://jsonlogic.com/>
- Revisit if: authors consistently reach past JSONLogic for logic expressiveness, bundle pressure forces a smaller engine, or a successor rules language emerges with equivalent YAML-native embedding and stronger tooling.
