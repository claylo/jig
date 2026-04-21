import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadConfigFromFile } from "../runtime/config.ts";

const USAGE = `jig validate — check a jig config for errors

Usage: jig validate <jig.yaml>

Parses the YAML, validates all fields, and runs cross-reference
checks (tool→connection, workflow→task, etc.). Exits 0 on success,
1 on validation error.

Options:
  -h, --help    Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  const configArg = positionals[0];
  if (!configArg) {
    process.stderr.write("jig validate: missing config path\n\n");
    process.stderr.write(USAGE + "\n");
    process.exit(1);
  }

  const configPath = resolve(configArg);

  try {
    const config = loadConfigFromFile(configPath);
    const toolCount = config.tools.length;
    const resourceCount = config.resources?.length ?? 0;
    const promptCount = config.prompts?.length ?? 0;
    const taskCount = config.tasks ? Object.keys(config.tasks).length : 0;

    const parts = [`${toolCount} tool${toolCount !== 1 ? "s" : ""}`];
    if (resourceCount > 0)
      parts.push(`${resourceCount} resource${resourceCount !== 1 ? "s" : ""}`);
    if (promptCount > 0)
      parts.push(`${promptCount} prompt${promptCount !== 1 ? "s" : ""}`);
    if (taskCount > 0)
      parts.push(`${taskCount} task${taskCount !== 1 ? "s" : ""}`);

    process.stdout.write(
      `ok: ${config.server.name}@${config.server.version} — ${parts.join(", ")}\n`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}
