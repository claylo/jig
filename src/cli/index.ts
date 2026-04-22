import { parseArgs } from "node:util";

const USAGE = `jig — YAML-driven MCP server toolkit

Usage: jig <command> [options]

Commands:
  validate <jig.yaml>          Validate a jig config (CI-friendly)
  dev [jig.yaml]               Run MCP server with hot-reload
  build <jig.yaml> -o <out>    Bundle to standalone .mjs
  new [template]               Scaffold a new jig.yaml

Options:
  -h, --help                   Show this help
  -V, --version                Show version

Run 'jig <command> --help' for command-specific help.`;

const flagArgs = process.argv.slice(2);

declare const __JIG_VERSION__: string | undefined;

if (flagArgs.includes("-V") || flagArgs.includes("--version")) {
  let version: string;
  if (typeof __JIG_VERSION__ !== "undefined") {
    version = __JIG_VERSION__;
  } else {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    version = (req("../../package.json") as { version: string }).version;
  }
  process.stdout.write(version + "\n");
  process.exit(0);
}

const { positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  args: flagArgs,
});

const command = positionals[0];

if (!command || command === "help") {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}

switch (command) {
  case "validate": {
    const { run } = await import("./validate.ts");
    await run(process.argv.slice(3));
    break;
  }
  case "dev": {
    const { run } = await import("./dev.ts");
    await run(process.argv.slice(3));
    break;
  }
  case "build": {
    const { run } = await import("./build.ts");
    await run(process.argv.slice(3));
    break;
  }
  case "new": {
    const { run } = await import("./new.ts");
    await run(process.argv.slice(3));
    break;
  }
  default:
    process.stderr.write(`jig: unknown command "${command}"\n\n`);
    process.stdout.write(USAGE + "\n");
    process.exit(1);
}
