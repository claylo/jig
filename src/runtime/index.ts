import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer, type ToolHandler } from "./server.ts";
import { invoke } from "./handlers/index.ts";
import { toolToInputSchema } from "./tools.ts";
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

  // Each tool's handler gets routed through the central invoke(). That
  // is what lets a dispatch tool reach exec, inline, or nested dispatch
  // without index.ts knowing the handler types.
  for (const tool of config.tools) {
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
