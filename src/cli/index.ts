#!/usr/bin/env node
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

const { positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  args: process.argv.slice(2),
});

const command = positionals[0];

if (!command || command === "help") {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}

const flagArgs = process.argv.slice(2);
if (flagArgs.includes("-h") || flagArgs.includes("--help")) {
  if (!command || command === "help") {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
  }
}

if (flagArgs.includes("-V") || flagArgs.includes("--version")) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json") as { version: string };
  process.stdout.write(pkg.version + "\n");
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
