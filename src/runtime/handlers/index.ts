import type { Handler } from "../config.ts";
import type { ToolCallResult, InvokeContext } from "./types.ts";
import { invokeInline } from "./inline.ts";
import { invokeExec } from "./exec.ts";
import { invokeDispatch } from "./dispatch.ts";
import { invokeCompute } from "./compute.ts";
import { invokeHttp } from "./http.ts";
import { invokeGraphql } from "./graphql.ts";

/**
 * Route a resolved Handler to the matching handler implementation.
 */
export async function invoke(
  handler: Handler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  if ("inline" in handler) return invokeInline(handler);
  if ("exec" in handler) return invokeExec(handler, args, ctx);
  if ("dispatch" in handler) {
    return invokeDispatch(handler, args, (h, a) => invoke(h, a, ctx), ctx.probe);
  }
  if ("compute" in handler) return invokeCompute(handler, args, ctx);
  if ("http" in handler) return invokeHttp(handler, args, ctx);
  if ("graphql" in handler) return invokeGraphql(handler, args, ctx);
  if ("workflow" in handler) {
    // Workflow handlers are task-only — they MUST be registered via
    // registerToolTask and driven by interpretWorkflow inside the
    // task's createTask callback. Reaching invoke() with a workflow
    // handler means the tool was registered via plain registerTool,
    // which is a Phase-5 boot-integration bug.
    throw new Error(
      `invoke: workflow handler "${handler.workflow.ref}" cannot be invoked through tools/call directly — it must be reached through the task lifecycle (registerToolTask). Tool registration is wired at boot in src/runtime/index.ts; check that this tool's execution.taskSupport is set.`,
    );
  }
  const _never: never = handler;
  throw new Error(`invoke: no handler implementation for ${JSON.stringify(_never)}`);
}

export type { ToolCallResult, InvokeContext };
