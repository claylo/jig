---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: [Jesse Vincent (via streamlinear source and fsck.com blog post)]
informed: []
---

# 0001: Typed flat-field dispatcher tools over an untyped payload catch-all

## Context and Problem Statement

Jig biases toward the dispatcher pattern to solve the MCP token-cost problem — the standard Linear MCP ships roughly 17,000 tokens of tool definitions per session; streamlinear collapses the same functional surface to roughly 500 tokens by exposing one tool with an `action` enum instead of one tool per operation. Once we commit to a single dispatching tool, one design question remains: how does that tool declare its inputs?

Two shapes are on the table. The source-material blog post ("When it comes to MCPs, everything we know about API design is wrong," fsck.com, 2025-10-19) argues for an untyped `payload: object` field whose meaning depends on `action`. The same author's production code at `github.com/obra/streamlinear` declares roughly thirteen typed optional flat fields instead. Which pattern should jig's generated tools follow?

## Decision Drivers

- MCP clients render `inputSchema` for users and validate requests before they hit our server; an untyped payload defeats both.
- Error messages for missing or malformed inputs must name the offending field, not "payload failed validation."
- The blog post and the production code disagree. When a source contradicts itself, we follow the code — that version shipped.
- Jig's YAML must stay ergonomic; adding a field is already a one-line edit, so typed flat fields are not a boilerplate tax.
- Authors tune dispatcher tool descriptions iteratively; per-action requirement errors are part of that tuning loop.

## Considered Options

- **Typed flat fields with per-action `requires:`** (streamlinear's production shape)
- **Untyped `payload` catch-all** (the fsck.com blog post's recommendation, matching Chrome MCP)
- **Nested per-action inputSchemas** discriminated by `action` value

## Decision Outcome

Chosen option: "Typed flat fields with per-action `requires:`," because it matches what the author of the dispatcher pattern actually shipped in production and gives MCP clients a usable `inputSchema` without giving up the token savings that motivated the dispatcher in the first place.

Jig's YAML makes this ergonomic through an `input:` block that declares every field once at the top level, and a `handler.dispatch` block whose per-action cases name the subset they require:

```yaml
input:
  action:    { type: string, required: true }
  id:        { type: string }
  state:     { type: string }
  # ...other optional fields...

handler:
  dispatch:
    on: action
    get:
      requires: [id]
      exec: ./handlers/get {{id}}
    update:
      requires: [id]
      exec: ./handlers/update {{id}} --state {{state}}
```

Jig enforces `requires:` at handler entry and surfaces violations as field-named errors back to the client. The `action` enum is inferred from the dispatch cases, so authors do not repeat themselves.

### Consequences

- Good, because MCP clients get a real `inputSchema` — autocomplete, type checking, and pre-flight validation all work.
- Good, because error messages name the offending field ("`id` is required for action `get`") instead of a generic payload failure.
- Good, because we follow the production code from the pattern's originator, not the speculative blog post that preceded it.
- Good, because `help: { auto: true }` can synthesize help text directly from the typed schema and `requires:` declarations.
- Bad, because tool definitions grow as authors add actions — thirteen optional fields is larger than one `payload: object`.
- Bad, because authors must remember to declare every field in `input:`; a forgotten field produces a clearer failure than an untyped payload would, but it is still a failure.

### Confirmation

The dispatcher templates shipped with `jig new` use typed flat fields. `jig validate` rejects `handler.dispatch` blocks that reference fields absent from `input:`. Generated `inputSchema` exposes each flat field with its declared type; the `action` enum is derived from the case names in `handler.dispatch`.

## Pros and Cons of the Options

### Typed flat fields with per-action `requires:`

Every possible input field is declared once at the top level of `input:`. Each dispatch case names the subset it requires.

- Good, because the `inputSchema` exposed to MCP clients is concrete and validatable.
- Good, because per-action requirement errors name the missing field ("`id` is required for action `get`").
- Good, because it matches streamlinear's production implementation — the dispatcher pattern as actually deployed.
- Good, because the `action` enum auto-derives from the dispatch case names, so the schema and the routing stay in sync.
- Neutral, because adding an action usually means adding a field or two, but those fields stay one line each in YAML.
- Bad, because the tool definition grows linearly with the action set; a tool with twenty actions declares every field either action might need.

### Untyped `payload` catch-all

One `payload: object` field; the handler interprets it per-action.

- Good, because the tool definition stays small regardless of how many actions exist.
- Good, because adding an action requires no schema change.
- Bad, because MCP clients cannot validate the payload shape before sending — clients see `object`, which tells them nothing.
- Bad, because validation errors surface as "payload failed validation," not as named-field errors.
- Bad, because the author of the recommending blog post did not ship it this way. Streamlinear uses typed flat fields in production. Following the post over the code means ignoring the evidence that matters.
- Bad, because autocomplete in MCP client UIs degrades to nothing — there are no fields to complete.

### Nested per-action inputSchemas

`{ action: "get", args: { id } }` vs `{ action: "update", args: { id, state } }`, with a distinct schema per action.

- Good, because each action's inputs are strictly typed and scoped.
- Good, because there is no ambiguity about which fields apply to which action.
- Bad, because JSON Schema lacks a first-class discriminated union. `oneOf` with a `const` discriminator works but produces verbose schemas and inconsistent error messages across validators.
- Bad, because the MCP spec exposes a single `inputSchema` per tool. Clients end up flattening the `oneOf` into one combined schema anyway, landing us back at typed flat fields — just with more YAML to maintain.
- Bad, because `args:` as a required wrapper is ergonomic overhead for authors and callers alike.

## More Information

- Design doc: [`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md) — see the "Tools" section and the "Untyped dispatcher payload" entry under "Alternatives considered."
- Pattern origin: [Jesse Vincent — "When it comes to MCPs, everything we know about API design is wrong"](https://blog.fsck.com/2025/10/19/mcps-are-not-like-other-apis.md).
- Production reference: [streamlinear](https://github.com/obra/streamlinear) — the dispatcher pattern with roughly thirteen typed optional flat fields and per-action requirement validation at handler entry. Code-Jesse over post-Jesse.
- Revisit if a future MCP spec introduces a native discriminated-union notion for `inputSchema`, or if tool descriptions grow large enough that the typed-field count itself becomes a token-cost problem.
