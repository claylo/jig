---
status: accepted
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0003: Per-section `extension_points:` composition policy from day one

## Context and Problem Statement

A jig server can ship with an embedded baseline `jig.yaml` (bundled by the author at build time) and also honor a sibling `jig.yaml` that the end user drops next to `server.mjs`. When both exist, how should they compose — and should the composition rule be global or declared per section of the YAML?

The answer needs to be in the v1 schema. Picking a simple global rule now and refining later would silently change the meaning of every `jig.yaml` that has already been written, which breaks the contract every author relied on when they shipped.

## Decision Drivers

- Authors need to ship a baseline surface users can extend without forking — that's the whole point of having sibling YAML.
- Different sections of the YAML have genuinely different extension semantics. Adding a tool is not the same as adding a connection header, which is not the same as renaming the server.
- Composition behavior is a contract. Changing it later rewrites the meaning of existing YAML without the author noticing.
- `--bare` builds (no embedded YAML) make the whole question moot — sibling YAML is authoritative — so the policy only has to work when a baseline is present.

## Considered Options

- **Sibling appends to embedded (global append-only).** One rule, simple to explain. Users add tools, resources, and prompts; they can never override the author's.
- **Sibling merges with embedded (global deep merge, sibling wins).** Maximally flexible. A deep-merge resolves every conflict with "sibling wins."
- **Per-section policy via `extension_points:` (chosen).** The author declares, per section, whether sibling YAML appends, merges, or is locked out. Sensible defaults apply when the block is omitted.

## Decision Outcome

Chosen option: "Per-section policy via `extension_points:`," because composition semantics are section-specific and we would rather pay the schema-complexity cost on day one than break every existing `jig.yaml` the first time an author needs "users can add tools but not rename my server."

The schema looks like this:

```yaml
extension_points:
  tools: append           # users can add tools, can't override the author's
  prompts: append
  connections: merge      # deep merge per connection name
  probes: merge
  server: locked          # sibling can't masquerade as a different server
  user_config: locked     # author defines install-time prompts; users don't add more
```

Defaults apply when `extension_points:` is omitted, so authors who never write the block still get reasonable behavior:

| Section | Default | Rationale |
|---|---|---|
| `tools`, `resources`, `prompts`, `tasks` | `append` | Collections extend naturally; identity is the name. |
| `connections`, `probes` | `merge` | Maps benefit from per-key override — a user can swap a header without redefining a connection. |
| `user_config`, `server` | `locked` | Identity fields. A sibling shouldn't be able to add install-time prompts or rename the server. |

In `--bare` builds there is no embedded YAML, so `extension_points:` is moot; the sibling YAML is the only YAML.

### Consequences

- Good, because authors can ship a locked-down baseline with explicit extension seams, matching how mature systems like Cargo, Docker, and Git compose user config with vendor defaults.
- Good, because the contract is visible in the YAML itself — a reader sees "tools: append, server: locked" and knows exactly what a sibling file can do.
- Good, because default behavior is reasonable for authors who don't care to think about it: collections append, maps merge, identity fields lock.
- Good, because `--bare` mode stays simple: no baseline means no composition, so `extension_points:` never runs.
- Bad, because v1 schema carries an extra block that authors have to learn exists, even if they never write one.
- Bad, because "append vs. merge vs. locked" is three concepts where one might have sufficed for the first release.
- Bad, because we now own the definition of each policy's edge cases — array identity for `append` (by `name`? by position?), deep-merge rules for `merge`, error messaging for `locked` violations.

### Confirmation

The schema ships with defaults wired in and a conformance test per section that asserts: append adds items, merge deep-merges maps, locked rejects sibling overrides with a clear error naming the conflicting field. Any future change to a default is itself an ADR.

## Pros and Cons of the Options

### Sibling appends to embedded (global append-only)

One composition rule across the whole file: sibling YAML can add to any collection; nothing else.

- Good, because the rule fits in one sentence and has no edge cases.
- Good, because the v1 schema carries no new block — composition is implicit.
- Neutral, because most v1 authors would not notice the limitation; the need for override shows up later.
- Bad, because the moment any author wants users to override a specific connection header or swap a tool implementation, the rule has to change — and changing it silently rewrites every existing `jig.yaml`.
- Bad, because "append-only" forces authors into awkward workarounds (duplicate a tool under a new name just to tweak its description) that the merge policy would handle cleanly.

### Sibling merges with embedded (global deep merge, sibling wins)

Deep merge across the file, sibling wins on conflicts.

- Good, because the rule is also one sentence and maximally flexible.
- Good, because authors never have to declare extension seams.
- Bad, because deep merge has surprising edge cases in YAML — array merge semantics (append? shadow-by-name? replace?) are not a settled convention, and whichever we pick will bite someone.
- Bad, because "sibling wins" means a user can rename the server or replace the author's tools without the author having any say — no way to lock anything down.
- Bad, because identity fields (`server.name`, `user_config` keys) shouldn't be overridable at all; a global merge gives authors no mechanism to protect them.

### Per-section policy via `extension_points:` (chosen)

Each section declares its composition policy independently; defaults cover the common cases.

- Good, because the policy matches the shape of the data — collections, maps, and identity fields each get the behavior that fits them.
- Good, because authors retain control: `server: locked` prevents masquerade, `tools: append` allows extension without override, `connections: merge` allows targeted header swaps.
- Good, because defaults mean most `jig.yaml` files never need to write the block.
- Neutral, because the schema gains one optional top-level key.
- Bad, because we commit to maintaining three composition semantics (append, merge, locked) and their edge cases for the life of the schema.
- Bad, because authors who do want to customize now have three knobs per section instead of one rule.

## More Information

- Design document: [`record/designs/2026-04-13-jig-design.md`](../designs/2026-04-13-jig-design.md), "Extension points" section (around line 353) and "Sibling YAML appends only (no override)" in "Alternatives considered" (around line 446).
- The `--bare` build mode (documented in the design doc, "CLI surface") ships no embedded YAML, so this ADR does not apply to that path. Sibling YAML is authoritative in `--bare` builds.
- Revisit if authors report recurring friction with a specific default, or if a fourth policy (for example, `replace` — sibling wholly replaces the embedded section) earns its keep. Any change to the defaults is itself an ADR so existing `jig.yaml` authors get a visible migration story.
