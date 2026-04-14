import { loadConfigFromFile, resolveConfigPath } from "./config.ts";
import { createServer } from "./server.ts";
import { createStdioTransport } from "./transports/stdio.ts";

async function main(): Promise<void> {
  const configPath = resolveConfigPath({
    argv: process.argv.slice(2),
    runtimeUrl: import.meta.url,
  });
  const config = loadConfigFromFile(configPath);

  const server = createServer(config);

  // Tool registration happens in Phase 4. For Plan 1's Phase 3, no tools
  // are registered yet — the server still responds to `initialize`.
  // `tools/list` and `tools/call` are not wired up until the first tool
  // is registered (see the note in src/runtime/server.ts), which is fine
  // because Phase 3's integration test only exercises `initialize`.

  await server.connect(createStdioTransport());
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`jig runtime fatal: ${message}\n`);
  process.exit(1);
});
