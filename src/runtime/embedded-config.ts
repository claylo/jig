// Sentinel module for embedded build-time values. In dev mode (running
// from source), these export null and the runtime falls back to CLI
// args and file-based config resolution. When `jig build` produces a
// standalone .mjs, esbuild replaces this module with build-time values.

export const embeddedYaml: string | null = null;
export const embeddedPort: number | null = null;
