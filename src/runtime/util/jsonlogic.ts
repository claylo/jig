import { AsyncLogicEngine } from "json-logic-engine";

/**
 * Central JSONLogic evaluation surface for the jig runtime.
 *
 * Plan 3 uses this engine in three places:
 *   - compute: handler — evaluate(logic, args) returns the value directly
 *   - when: guard on dispatch cases — evaluate(logic, args) must be truthy
 *   - transform: at tool level — evaluate(logic, { result, args }) reshapes output
 *
 * Helpers per ADR-0008 register against this engine; see util/helpers.ts
 * (wired in Phase 2). Keeping the engine singleton means helpers are
 * registered once at module init and every caller shares the same
 * compiled-rule cache.
 *
 * The async engine is always used, even for sync-underlying helpers.
 * One engine, one evaluation model, matches ADR-0002.
 */

/**
 * Opaque JSONLogic rule type. Rules are arbitrary JSON — anything the
 * engine accepts. We carry this alias so call sites don't spray
 * `unknown` through every type annotation.
 */
export type JsonLogicRule = unknown;

const engine = new AsyncLogicEngine();

/**
 * Evaluate a JSONLogic rule against a data context.
 *
 * Delegates to `AsyncLogicEngine.run`. Returns whatever the engine
 * produces: primitives pass through, operators return values, missing
 * vars resolve to null (not thrown), and unknown operators throw at the
 * engine boundary — which dispatch-level and handler-level callers must
 * catch and surface as isError tool results, not JSON-RPC errors.
 */
export async function evaluate(
  rule: JsonLogicRule,
  data: Record<string, unknown>,
): Promise<unknown> {
  return engine.run(rule, data);
}

/**
 * Module-internal accessor for helper registration. Phase 2's
 * util/helpers.ts calls this once at import time to register the 16
 * read-only helpers from ADR-0008. Not exported — callers outside the
 * runtime cannot mutate the engine.
 */
export function getEngine(): AsyncLogicEngine {
  return engine;
}
