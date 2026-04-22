import { parseArgs } from "node:util";
import { resolve, dirname, join } from "node:path";
import { watch, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

function findRuntimePath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "src", "runtime", "index.ts");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("jig dev: cannot find src/runtime/index.ts");
}

const RUNTIME_PATH = findRuntimePath();

const USAGE = `jig dev — run an MCP server with hot-reload

Usage: jig dev [jig.yaml] [options]

Starts the MCP server from the given config. When the YAML file
changes on disk, the server restarts automatically. Defaults to
jig.yaml in the current directory.

Options:
  --port <n>       Serve over HTTP on this port (default: stdio)
  --no-watch       Disable hot-reload
  -h, --help       Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      port: { type: "string" },
      watch: { type: "boolean", default: true, negatable: true },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  const configArg = positionals[0] ?? "jig.yaml";
  const configPath = resolve(configArg);
  const noWatch = values.watch === false;

  let child: ChildProcess | null = null;
  let restarting = false;

  function spawnRuntime(): ChildProcess {
    const args = [
      "--experimental-transform-types",
      RUNTIME_PATH,
      "--config",
      configPath,
    ];
    if (values.port) {
      args.push("--port", values.port);
    }

    const proc = spawn(process.execPath, args, {
      stdio: ["inherit", "inherit", "inherit"],
    });

    proc.on("exit", (code, signal) => {
      if (!restarting) {
        process.exit(code ?? (signal ? 1 : 0));
      }
    });

    return proc;
  }

  function restart(): void {
    if (!child) return;
    restarting = true;
    child.kill("SIGTERM");
    child.on("exit", () => {
      restarting = false;
      process.stderr.write("jig dev: reloading...\n");
      child = spawnRuntime();
    });
  }

  child = spawnRuntime();

  if (!noWatch) {
    const watchDir = dirname(configPath);
    const watcher = watch(watchDir, { recursive: false }, (_event, filename) => {
      if (filename && filename.endsWith(".yaml") || filename?.endsWith(".yml")) {
        restart();
      }
    });

    process.on("SIGINT", () => {
      watcher.close();
      child?.kill("SIGTERM");
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      watcher.close();
      child?.kill("SIGTERM");
      process.exit(0);
    });
  }
}
