import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, parseConfig, resolveConfigPath } from "./config.ts";
import { embeddedYaml, embeddedPort } from "./embedded-config.ts";
import { createServer, type CallToolResult, type JigTaskHandler, type ToolHandler } from "./server.ts";
import { registerResources, startWatchers } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { interpretWorkflow, type ElicitParams, type ElicitResponse } from "./tasks.ts";
import { createStdioTransport } from "./transports/stdio.ts";
import { createHttpTransport } from "./transports/http.ts";
import { resolveDispatchCase } from "./handlers/dispatch.ts";
import { evaluate } from "./util/jsonlogic.ts";
import { configureAccess, isHostAllowed } from "./util/access.ts";
import { applyTransform } from "./util/transform.ts";
import { compileConnections } from "./connections.ts";
import { resolveProbes } from "./probes.ts";
// jsonlogic.ts helpers register at module load time; the evaluate import
// above triggers it.

async function main(): Promise<void> {
  const config = embeddedYaml !== null
    ? parseConfig(embeddedYaml)
    : loadConfigFromFile(resolveConfigPath({
        argv: process.argv.slice(2),
        runtimeUrl: import.meta.url,
      }));

  const runtimeRoot = dirname(fileURLToPath(import.meta.url));
  configureAccess(config.server.security ?? {}, runtimeRoot, config.connections);

  // Sanity check: every declared connection's host must pass the
  // allowlist — otherwise the author set network.allow to something
  // that excludes their own connection, and every request through that
  // connection would deny. Fail fast at boot.
  if (config.connections) {
    for (const [name, def] of Object.entries(config.connections)) {
      let host: string;
      try {
        host = new URL(def.url).hostname;
      } catch {
        throw new Error(
          `connections.${name}: url "${def.url}" is not a valid URL`,
        );
      }
      if (!isHostAllowed(host)) {
        throw new Error(
          `connections.${name}: host "${host}" is not in server.security.network.allow`,
        );
      }
    }
  }

  const compiled = config.connections ? compileConnections(config.connections) : {};

  // resolveProbes calls process.exit(1) on any failure — no try/catch needed.
  // Must run AFTER configureAccess (probes may themselves hit network hosts
  // that must be allowlisted) and BEFORE createServer (createServer's
  // registerTool closure captures probe for description rendering).
  const probe = await resolveProbes(config.probes, compiled);

  const server = createServer(config, probe);

  const ctx = { connections: compiled, probe };

  // Partition tools by execution.taskSupport. Plain tools route through
  // registerTool with the central invoke(). Task tools route through
  // registerToolTask, where createTask spawns interpretWorkflow on the
  // referenced state-machine workflow asynchronously and pushes status
  // updates / a terminal result to the request-scoped task store.
  for (const tool of config.tools) {
    if (tool.execution !== undefined) {
      registerTaskTool(tool);
    } else {
      registerPlainTool(tool);
    }
  }

  function registerPlainTool(tool: typeof config.tools[number]): void {
    const handler: ToolHandler = async (args: unknown) => {
      const normalized = normalizeArgs(args);
      const raw = await invoke(tool.handler, normalized, ctx);
      if (tool.transform === undefined) return raw;
      return applyTransform(raw, normalized, ctx.probe, tool.transform);
    };
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
      },
      handler,
    );
  }

  function registerTaskTool(tool: typeof config.tools[number]): void {
    // Cross-ref check at parseConfig already guarantees the outer
    // handler is workflow: OR dispatch:; Phase 7 fusion routes both.
    const outerHandler = tool.handler;
    const isOuterWorkflow = "workflow" in outerHandler;
    const isOuterDispatch = "dispatch" in outerHandler;
    if (!isOuterWorkflow && !isOuterDispatch) {
      throw new Error(
        `boot: task tool "${tool.name}" reached registerTaskTool with neither workflow: nor dispatch: outer handler (parseConfig cross-ref should have caught this)`,
      );
    }

    server.registerToolTask(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolToInputSchema(tool),
        taskSupport: tool.execution!.taskSupport,
      },
      {
        async createTask(args, store, elicit) {
          // Two outer-handler shapes:
          //   1. workflow: → kick off interpreter (Phase 6 simple case)
          //   2. dispatch: → resolve case, then either workflow OR sync
          if (isOuterWorkflow) {
            return startWorkflowTask(
              outerHandler.workflow.ref,
              outerHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
              elicit,
            );
          }

          // Dispatch outer handler — resolve the matched case.
          const resolved = resolveDispatchCase(outerHandler, args);
          if (!resolved.matched) {
            // No case matched — return a synthetic immediately-failed task.
            const task = await store.createTask({ ttl: 60_000 });
            await store.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: resolved.reason }],
              isError: true,
            });
            return { task };
          }

          // Evaluate when: guard if present — resolveDispatchCase skips it.
          if (resolved.case.when !== undefined) {
            let guardPassed: boolean;
            try {
              const raw = await evaluate(resolved.case.when, { ...args, probe: ctx.probe });
              guardPassed = Boolean(raw);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              const task = await store.createTask({ ttl: 60_000 });
              await store.storeTaskResult(task.taskId, "failed", {
                content: [{ type: "text", text: `dispatch: guard for action "${resolved.caseName}" errored: ${message}` }],
                isError: true,
              });
              return { task };
            }
            if (!guardPassed) {
              const task = await store.createTask({ ttl: 60_000 });
              await store.storeTaskResult(task.taskId, "failed", {
                content: [{ type: "text", text: `dispatch: guard for action "${resolved.caseName}" did not pass` }],
                isError: true,
              });
              return { task };
            }
          }

          const caseHandler = resolved.case.handler;
          if ("workflow" in caseHandler) {
            return startWorkflowTask(
              caseHandler.workflow.ref,
              caseHandler.workflow.ttl_ms ?? 300_000,
              args,
              store,
              elicit,
            );
          }

          // Sync case — invoke and store immediately as a one-step
          // synthetic task. The SDK still gets a CreateTaskResult shape;
          // the task is already terminal by the time tasks/get is called.
          const task = await store.createTask({ ttl: 60_000 });
          try {
            const result = await invoke(caseHandler, args, ctx);
            const status: "completed" | "failed" = result.isError ? "failed" : "completed";
            await store.storeTaskResult(task.taskId, status, result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await store.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: `dispatch case "${resolved.caseName}" threw: ${message}` }],
              isError: true,
            });
          }
          return { task };
        },
        async getTask(taskId, store) {
          const t = await store.getTask(taskId);
          if (!t) throw new Error(`tasks/get: task "${taskId}" not found`);
          return t;
        },
        async getTaskResult(taskId, store) {
          const r = await store.getTaskResult(taskId);
          if (!r) throw new Error(`tasks/get: result for task "${taskId}" not found`);
          return r as CallToolResult;
        },
      },
    );

    // Helper closure: kicks off a workflow as a task. Shared between
    // the outer-workflow case and the dispatch-case-routes-to-workflow case.
    async function startWorkflowTask(
      workflowRef: string,
      ttl_ms: number,
      args: Record<string, unknown>,
      store: Parameters<JigTaskHandler["createTask"]>[1],
      elicit: (params: unknown) => Promise<unknown>,
    ) {
      const workflow = config.tasks?.[workflowRef];
      if (!workflow) {
        throw new Error(
          `boot: workflow "${workflowRef}" not declared in tasks: (parseConfig cross-ref should have caught this)`,
        );
      }
      const task = await store.createTask({ ttl: ttl_ms });
      interpretWorkflow({
        workflow,
        args,
        ctx,
        store,
        taskId: task.taskId,
        invoke,
        elicit: async (params: ElicitParams): Promise<ElicitResponse> => {
          const result = await elicit(params) as { action: string; content?: Record<string, unknown> };
          return {
            action: result.action as ElicitResponse["action"],
            content: result.content,
          };
        },
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`jig: workflow "${workflowRef}" crashed: ${message}\n`);
        store.storeTaskResult(task.taskId, "failed", {
          content: [{ type: "text", text: `workflow "${workflowRef}" crashed: ${message}` }],
          isError: true,
        }).catch(() => {});
      });
      return { task };
    }
  }

  // trackSubscriptions() advertises capabilities.resources.subscribe: true
  // and wires the subscribe/unsubscribe request handlers via the low-level
  // Server. Gate the whole resources path on config.resources so a tools-only
  // config doesn't advertise a resources capability it can't back.
  if (config.resources) {
    registerResources(server, config.resources, ctx);
    const tracker = server.trackSubscriptions();
    startWatchers(config.resources, server, tracker, ctx);
  }

  if (config.prompts) {
    registerPrompts(server, config.prompts, ctx);
  }

  if (config.completions) {
    server.wireCompletions(config.completions);
  }

  const portArg = parsePortArg(process.argv.slice(2)) ?? embeddedPort ?? undefined;
  if (portArg !== undefined) {
    const http = createHttpTransport({ port: portArg });
    await server.connect(http.transport);
    const addr = await http.listening;
    process.stderr.write(
      `jig: serving MCP over HTTP at http://${addr.hostname}:${addr.port}/mcp\n`,
    );
  } else {
    await server.connect(createStdioTransport());
  }
}

/**
 * The SDK hands our handler whatever the client sent as
 * `tools/call.params.arguments` — typed as `unknown` at the adapter
 * boundary. In practice MCP clients send a JSON object (or nothing).
 * Normalize both shapes to `Record<string, unknown>` so handlers can
 * read fields without defensive checks at every call site.
 */
function parsePortArg(argv: string[]): number | undefined {
  const idx = argv.indexOf("--port");
  if (idx === -1) return undefined;
  const raw = argv[idx + 1];
  if (raw === undefined) {
    process.stderr.write("jig: --port requires a port number\n");
    process.exit(1);
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write(`jig: invalid port "${raw}"\n`);
    process.exit(1);
  }
  return port;
}

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`jig runtime fatal: ${message}\n`);
  process.exit(1);
});
