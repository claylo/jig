import { parseArgs } from "node:util";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function findExamplesDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "examples");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("jig new: cannot find examples directory");
}

const EXAMPLES_DIR = findExamplesDir();

const USAGE = `jig new — scaffold a new jig.yaml

Usage: jig new [template] [options]

Creates a new jig.yaml in the current directory from a template.
Defaults to the "minimal" template.

Templates:
  minimal              Single inline tool (default)
  dispatcher           Dispatcher pattern with exec handlers
  http-and-graphql     HTTP + GraphQL connections
  compute-and-guards   JSONLogic guards + compute handlers
  probes               Startup probes
  resources            Resources with watchers
  prompts-completions  Prompt templates + completions
  tasks                State machine workflows
  tasks-elicitation    Task workflows with elicitation

Options:
  -o, --output <path>  Output file (default: jig.yaml)
  --list               List available templates
  -h, --help           Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      list: { type: "boolean" },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  if (values.list) {
    const files = readdirSync(EXAMPLES_DIR)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(/\.yaml$/, ""))
      .sort();
    for (const f of files) {
      process.stdout.write(`  ${f}\n`);
    }
    return;
  }

  const template = positionals[0] ?? "minimal";
  const templateFile = join(EXAMPLES_DIR, `${template}.yaml`);

  if (!existsSync(templateFile)) {
    process.stderr.write(`jig new: unknown template "${template}"\n`);
    process.stderr.write("Run 'jig new --list' to see available templates.\n");
    process.exit(1);
  }

  const outPath = resolve(values.output ?? "jig.yaml");

  if (existsSync(outPath)) {
    process.stderr.write(`jig new: ${outPath} already exists\n`);
    process.exit(1);
  }

  const content = readFileSync(templateFile, "utf8");
  writeFileSync(outPath, content);
  process.stdout.write(`ok: created ${outPath} from "${template}" template\n`);
}
