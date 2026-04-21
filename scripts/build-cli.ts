import { build } from "esbuild";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync, copyFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "src", "cli", "index.ts");
const outfile = join(root, "bin", "jig.mjs");

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile,
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __jig_createRequire } from 'node:module';",
      "const require = __jig_createRequire(import.meta.url);",
    ].join("\n"),
  },
  external: ["esbuild"],
  sourcemap: false,
  minify: false,
  treeShaking: true,
});

if (result.errors.length > 0) {
  for (const e of result.errors) {
    process.stderr.write(`${e.text}\n`);
  }
  process.exit(1);
}

chmodSync(outfile, 0o755);

const binJig = join(root, "bin", "jig");
copyFileSync(outfile, binJig);
chmodSync(binJig, 0o755);

process.stdout.write(`ok: ${outfile}\nok: ${binJig}\n`);
