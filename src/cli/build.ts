import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { loadConfigFromFile } from "../runtime/config.ts";

const RUNTIME_ENTRY = new URL("../runtime/index.ts", import.meta.url).pathname;

const USAGE = `jig build — bundle a jig config into a standalone .mjs

Usage: jig build <jig.yaml> -o <output.mjs>
       jig build --bare -o <output.mjs>

Bundles the jig runtime with the author's YAML embedded into a
single-file ESM module. The produced .mjs requires only Node 24+
to run — no npm install, no node_modules.

Options:
  -o, --output <path>   Output file path (required)
  --bare                Produce a generic engine with no embedded YAML;
                        expects a sibling jig.yaml at runtime
  --port <n>            Bake in HTTP transport on this port (default: stdio)
  -h, --help            Show this help`;

export async function run(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      bare: { type: "boolean", default: false },
      port: { type: "string" },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  if (!values.output) {
    process.stderr.write("jig build: -o / --output is required\n\n");
    process.stderr.write(USAGE + "\n");
    process.exit(1);
  }

  const outPath = resolve(values.output);
  const bare = values.bare === true;

  let yamlContent: string | null = null;

  if (!bare) {
    const configArg = positionals[0];
    if (!configArg) {
      process.stderr.write(
        "jig build: missing config path (use --bare for no embedded YAML)\n\n",
      );
      process.stderr.write(USAGE + "\n");
      process.exit(1);
    }

    const configPath = resolve(configArg);

    // Validate before bundling — fail fast on bad YAML.
    try {
      loadConfigFromFile(configPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`jig build: config validation failed: ${message}\n`);
      process.exit(1);
    }

    yamlContent = readFileSync(configPath, "utf8");
  }

  const embeddedConfigPlugin = {
    name: "jig-embedded-config",
    setup(b: import("esbuild").PluginBuild) {
      b.onResolve({ filter: /\/embedded-config\.ts$/ }, (args) => ({
        path: args.path,
        namespace: "jig-embedded",
      }));
      b.onLoad(
        { filter: /.*/, namespace: "jig-embedded" },
        () => ({
          contents: `export const embeddedYaml = ${yamlContent !== null ? JSON.stringify(yamlContent) : "null"};`,
          loader: "ts" as const,
        }),
      );
    },
  };

  try {
    const result = await build({
      entryPoints: [RUNTIME_ENTRY],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      outfile: outPath,
      plugins: [embeddedConfigPlugin],
      banner: {
        js: [
          "#!/usr/bin/env node",
          "import { createRequire as __jig_createRequire } from 'node:module';",
          "const require = __jig_createRequire(import.meta.url);",
        ].join("\n"),
      },
      sourcemap: false,
      minify: false,
      treeShaking: true,
    });

    if (result.errors.length > 0) {
      process.stderr.write("jig build: esbuild errors:\n");
      for (const e of result.errors) {
        process.stderr.write(`  ${e.text}\n`);
      }
      process.exit(1);
    }

    // Make executable.
    const { chmodSync } = await import("node:fs");
    chmodSync(outPath, 0o755);

    const stat = readFileSync(outPath);
    const kb = Math.round(stat.length / 1024);
    process.stdout.write(`ok: ${outPath} (${kb} KB)\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`jig build: ${message}\n`);
    process.exit(1);
  }
}
