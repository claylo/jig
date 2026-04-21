// Sentinel module for embedded YAML config. In dev mode (running from
// source), this exports null and the runtime falls back to file-based
// config resolution. When `jig build` produces a standalone .mjs,
// esbuild replaces this module with one that exports the author's YAML
// as a string constant.

export const embeddedYaml: string | null = null;
