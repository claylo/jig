import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { invokeInline } from "./handlers/inline.ts";
import { toolToInputSchema } from "./tools.ts";
import { createStdioTransport } from "./transports/stdio.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

  const server = createServer(config);

  // Plan 1 registers each YAML tool directly on McpServer — no intermediate
  // registry. The SDK's McpServer already owns the name → tool map and
  // wires tools/list + tools/call on the first registerTool call
  // (index.mjs:1335 → setToolRequestHandlers). Introducing our own
  // ToolRegistry class here would duplicate that with no benefit.
  //
  // Plan 1 supports only the `inline` handler. When additional handler
  // types land (exec, http, graphql, dispatch, compute in Plan 2+), this
  // loop routes into a dispatcher rather than growing into a switch.
  for (const tool of config.tools) {
    // Phase 3 interim: the Handler union now admits DispatchHandler, but
    // validateHandler still only produces InlineHandler. Narrow before
    // dispatching; Phase 4 replaces this with a central invoke().
    const toolHandler = tool.handler;
    const handler: ToolHandler = async (_args: unknown) => {
      if ("inline" in toolHandler) return invokeInline(toolHandler);
      throw new Error(
        `runtime: tool "${tool.name}" has a handler type not yet reachable from config parsing`,
      );
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

  await server.connect(createStdioTransport());
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`jig runtime fatal: ${message}\n`);
  process.exit(1);
});
