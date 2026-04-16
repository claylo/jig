import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type CallToolResult, type ToolHandler } from "./server.ts";
import { registerResources, startWatchers } from "./resources.ts";
import { registerPrompts } from "./prompts.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { interpretWorkflow } from "./tasks.ts";
import { createStdioTransport } from "./transports/stdio.ts";
import { configureAccess, isHostAllowed } from "./util/access.ts";
import { applyTransform } from "./util/transform.ts";
import { compileConnections } from "./connections.ts";
import { resolveProbes } from "./probes.ts";
// Side-effect: registers the 16 built-in JSONLogic helpers per ADR-0008.
// Keeps registration centralized at runtime boot rather than deferred
// until a compute/when/transform rule triggers a helper lookup.
import "./util/helpers.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

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
    // Cross-ref check at parseConfig already guarantees the handler is
    // workflow: and the ref resolves; narrow with a runtime assertion
    // so the type system follows.
    if (!("workflow" in tool.handler)) {
      throw new Error(
        `boot: task tool "${tool.name}" reached registerTaskTool without a workflow handler (parseConfig cross-ref should have caught this)`,
      );
    }
    const workflowRef = tool.handler.workflow.ref;
    const ttl_ms = tool.handler.workflow.ttl_ms ?? 300_000;
    const workflow = config.tasks?.[workflowRef];
    if (!workflow) {
      throw new Error(
        `boot: workflow "${workflowRef}" not declared in tasks: (parseConfig cross-ref should have caught this)`,
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
        async createTask(args, store) {
          const task = await store.createTask({ ttl: ttl_ms });
          // Fire-and-forget: interpretWorkflow walks the state machine,
          // pushes status updates, and stores the terminal result. Errors
          // inside the interpreter become failed task results — they
          // never bubble out of this createTask callback.
          void interpretWorkflow({
            workflow,
            args,
            ctx,
            store,
            taskId: task.taskId,
            invoke,
          });
          return { task };
        },
        async getTask(taskId, store) {
          const t = await store.getTask(taskId);
          if (!t) {
            throw new Error(`tasks/get: task "${taskId}" not found`);
          }
          return t;
        },
        async getTaskResult(taskId, store) {
          // The store returns the broader Result type; the interpreter only
          // ever stores CallToolResult-shaped objects. Cast at the boundary.
          return (await store.getTaskResult(taskId)) as CallToolResult;
        },
      },
    );
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

  await server.connect(createStdioTransport());
}

/**
 * The SDK hands our handler whatever the client sent as
 * `tools/call.params.arguments` — typed as `unknown` at the adapter
 * boundary. In practice MCP clients send a JSON object (or nothing).
 * Normalize both shapes to `Record<string, unknown>` so handlers can
 * read fields without defensive checks at every call site.
 */
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
