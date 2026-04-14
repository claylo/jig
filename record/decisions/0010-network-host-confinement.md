---
status: proposed
date: 2026-04-14
decision-makers: [Clay Loveless]
consulted: []
informed: []
---

# 0010: Network host confinement for connections and handlers

## Context and Problem Statement

Plan 4 introduces outbound network access through a new `connections:` block plus `http:` and `graphql:` handlers. [ADR-0009](0009-path-and-env-confinement-for-helpers.md) established a deny-by-default posture for filesystem and env reads; network is the next threat surface. A prompt-injected LLM acting as the MCP client — still the baseline adversary — can coax a handler into reading an attacker-controlled URL, then POSTing local data to it. Secrets stored in connection headers (Linear tokens, GitHub PATs, API keys) are precisely the data authors don't want leaving the machine.

The question: **where should the runtime be allowed to reach over the network, and what's the default when an author hasn't thought about it?**

## Decision Drivers

- **Defaults matter more than options.** Authors who never read a security section should still ship a server that can't exfiltrate data to arbitrary hosts.
- **ADR-0009's pattern is proven.** Deny-by-default + allowlist + explicit override is the shape we already use for paths and env. A third concept would fragment the mental model.
- **Declaring a `connection:` already names the host.** Requiring authors to duplicate that in `server.security.network.allow` is ceremony for no benefit in the happy path.
- **Handlers support a one-off `url:`.** That escape hatch can't become a rogue-host oracle. If authors want it, they declare the host.
- **The threat is the LLM, not the author.** An author who deliberately wants to POST to `evil.com` can write it into the YAML anyway — the goal is to prevent an LLM from steering the handler there through crafted arguments.

## Considered Options

- **A. No network allowlist in v1** — match exec's permissive model. Trust the YAML.
- **B. Explicit opt-in via `server.security.network.allow`** — default allow, author declares restriction.
- **C. Deny-by-default, inferred from `connections:` when unset** (chosen).
- **D. Per-connection `allow:` lists** — each connection names its own hosts.

## Decision Outcome

Chosen: **C. Deny-by-default, inferred from `connections:` when `server.security.network.allow` is unset.**

### YAML surface

`server.security.network.allow` is an optional glob list that sits alongside `filesystem.allow` and `env.allow` from ADR-0009:

```yaml
server:
  name: my-server
  security:
    filesystem: { allow: [...] }
    env:        { allow: [...] }
    network:
      allow:
        - "api.linear.app"
        - "*.github.com"
```

When the field is absent, the runtime infers the allowlist from the set of declared `connections:`:

```yaml
connections:
  linear_api:
    url: https://api.linear.app/graphql
  gh_api:
    url: https://api.github.com
# → inferred allowlist: ["api.linear.app", "api.github.com"]
```

When both are absent — no explicit `network.allow` and no `connections:` — the allowlist is empty and every outbound request denies. A handler that sets a one-off `url:` without a declared connection cannot reach any host.

### Enforcement

`src/runtime/util/access.ts` grows one public function and one field of module state, mirroring the env scaffolding from ADR-0009:

- `configureAccess(security, runtimeRoot, connections?)` — extended signature. When `connections` is provided and `security.network.allow` is absent, each connection's URL hostname joins the allowlist.
- `isHostAllowed(hostname: string): boolean` — returns true when the hostname matches at least one compiled glob pattern and `configureAccess` has been called.
- Glob patterns use the same `*`-only compiler as env patterns (ADR-0009) — a literal match on `api.linear.app`, a wildcard on `*.github.com`. No other regex metacharacters.
- Deny-by-default before `configureAccess` runs.

Every outbound request, across http and graphql handlers, calls `isHostAllowed(new URL(fullUrl).hostname)` before invoking `fetch`. Deny produces `isError: true` with `http: host "x.com" not in server.security.network.allow` — a tool-call failure, not a JSON-RPC protocol error.

### Boot-time sanity check

`src/runtime/index.ts` validates each connection URL against `isHostAllowed` immediately after `configureAccess` returns. An author who sets an explicit `network.allow` that excludes their own declared connection gets a clear startup error rather than a mysterious runtime deny later.

## Consequences

- **Good**, because the LLM-driven exfiltration path is closed by default. An author who declares `connections: { linear_api: { url: https://api.linear.app/graphql } }` gets a server that cannot `POST /v1/drop` to `evil.com` even when asked.
- **Good**, because the happy path requires zero security ceremony. Declaring a connection already names the host; the author does nothing extra.
- **Good**, because the pattern matches ADR-0009 exactly — authors learn one security model, apply it to three resources (paths, env vars, hosts).
- **Good**, because explicit `network.allow` still works — authors who want to enable a webhook URL without declaring a full connection (fire-and-forget POST from compute output, for example) can opt in.
- **Good**, because the empty-allowlist-on-no-connections default is safe. An author who configures only local tools (no network) cannot accidentally grow a network-reachable hole.
- **Bad**, because handlers using a one-off `url:` without `connection:` require an explicit `network.allow` declaration. That's friction, but it's exactly the friction we want — one-off URLs are the riskiest pattern and deserve explicit intent.
- **Bad**, because the allowlist is host-level, not URL-level. A compromised connection URL can still POST anywhere on its declared host's path space. Mitigation: prefer connections scoped to a single API root. If per-path restriction becomes a real need, a later ADR can layer `path:` filters.
- **Bad**, because hostname-only matching treats `example.com:8080` and `example.com:443` identically. Ports are ignored. That simplification fits v1 but may need revisiting if authors need port-level segmentation.
- **Neutral**, because `jig validate` (Plan 6) can surface the inferred allowlist and flag handlers whose `url:` would deny at runtime.

## Confirmation

- Unit tests in `tests/access.test.ts` cover: explicit `network.allow` honored; absent `network.allow` + populated `connections:` → inferred list from URL hosts; absent both → deny all; glob `*.github.com` matches `api.github.com`; literal `api.linear.app` matches exactly; port in hostname-parse ignored.
- Handler tests in `tests/handlers.test.ts` cover: allowed host reaches `fetch`; denied host produces `isError` with the expected message prefix; one-off `url:` on a handler without a matching `network.allow` denies.
- Integration test (Plan 4 Phase 7) exercises a real `http.createServer()` fixture under a declared connection, plus a denied one-off-URL path.
- Boot-time sanity check fires when `security.network.allow` excludes a declared connection's host — config load fails with a descriptive error naming the connection and the offending host.

## Pros and Cons of the Options

### A. No network allowlist in v1

Match the exec handler's permissive model. Any URL the YAML names is reachable.

- Good, because it's zero new code.
- Bad, because it mirrors the failure mode ADR-0009 just closed: a handler that takes a URL fragment from args can be steered to an arbitrary host by a prompt-injected client.
- Bad, because it treats outbound network as the same threat class as local-process spawn. `exec:` runs commands the author wrote; a URL composed from args is a different ergonomic the LLM can subvert.

### B. Explicit opt-in via `server.security.network.allow`

Author-controlled allowlist. Default is "all hosts allowed" when unset.

- Good, because it preserves author freedom.
- Bad, because the default is the dangerous case. Authors who don't read the security section ship a server that will happily POST anywhere.
- Bad, because it duplicates effort — an author who names `linear_api` is already declaring the host; making them repeat it in `security.network.allow` to get protection is ceremony with no information gain.

### C. Deny-by-default, inferred from `connections:` (chosen)

The approach described above.

- Good, because the happy path requires zero extra config and the dangerous path is closed.
- Good, because it borrows ADR-0009's proven pattern — allowlist + glob + deny-by-default.
- Good, because the connection declaration is already visible in code review; authors who want to know the server's network reach look in one place.
- Neutral, because one-off `url:` handlers need explicit declarations. That's a deliberate friction to make the riskiest pattern visible.
- Bad, because hostname-only matching isn't URL-path-level. Not the target of this ADR.

### D. Per-connection `allow:` lists

Each connection block carries its own `allow:` field listing reachable hosts.

- Good, because granularity: a connection could declare exactly one host.
- Bad, because the connection's `url:` already names the host. Duplication invites drift.
- Bad, because the security posture becomes hard to read — reviewers would scan every connection block instead of one `server.security.network` entry.
- Bad, because it spreads security-relevant declarations across the file. ADR-0009 already chose centralized `server.security`; consistency wins.

## More Information

- [ADR-0009: Path and env confinement for built-in helpers](0009-path-and-env-confinement-for-helpers.md) — the pattern this ADR extends. Glob syntax, deny-by-default behavior, and module state scaffolding all come from there.
- [ADR-0008: JSONLogic built-in helpers](0008-jsonlogic-builtin-helpers.md) — ruled out network access inside helpers; this ADR governs network access via handlers instead.
- [Design doc: Plan 4 — connections, http, graphql](../designs/2026-04-14-plan4-connections-http-graphql.md) — the composed narrative this ADR fits into.
- Plan 4 Phase 3 lands the `access.ts` network extension this ADR specifies.

Revisit when (a) per-path URL filtering becomes a real author need, (b) port-level segmentation surfaces (internal service mesh use cases), or (c) Plan 7's HTTP transport broadens the inbound threat model and demands companion inbound controls.
