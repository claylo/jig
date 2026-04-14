import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
import { createStdioTransport } from "./transports/stdio.ts";
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

  const server = createServer(config);

  // Each tool's handler gets routed through the central invoke(). That
  // is what lets a dispatch tool reach exec, inline, or nested dispatch
  // without index.ts knowing the handler types.
  for (const tool of config.tools) {
    const handler: ToolHandler = async (args: unknown) =>
      invoke(tool.handler, normalizeArgs(args));
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
