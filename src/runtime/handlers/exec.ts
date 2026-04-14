import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecHandler } from "../config.ts";
import type { ToolCallResult } from "./types.ts";
import { render } from "../util/template.ts";

const execFileAsync = promisify(execFile);

/**
 * Run a shell-style command by rendering its template through Mustache,
 * whitespace-splitting into argv, and invoking `child_process.execFile`.
 *
 * Explicitly not a shell: `shell: true` is never set, so pipes,
 * redirects, and environment variable expansion inside the command
 * string are treated as literal text. Authors who need shell features
 * write a wrapper script and exec that script. See ADR-0006.
 *
 * stdout is returned verbatim (including trailing newlines). Non-zero
 * exit, missing executable, or any other spawn error produces an
 * `isError: true` result whose text content carries the error message.
 */
export async function invokeExec(
  handler: ExecHandler,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  const rendered = render(handler.exec, args);
  const argv = rendered.trim().split(/\s+/).filter((part) => part.length > 0);

  if (argv.length === 0) {
    return errorResult(`exec: empty command after template render: "${handler.exec}"`);
  }

  const [command, ...commandArgs] = argv;

  try {
    const { stdout } = await execFileAsync(command!, commandArgs);
    return { content: [{ type: "text", text: stdout }] };
  } catch (err: unknown) {
    return errorResult(formatError(err));
  }
}

function errorResult(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatError(err: unknown): string {
  if (err === null || err === undefined) return "exec: unknown error";
  if (err instanceof Error) {
    // execFile errors carry stderr/code fields; include them when present.
    const maybeCode = (err as Error & { code?: string | number }).code;
    const maybeStderr = (err as Error & { stderr?: string | Buffer }).stderr;
    const parts = [err.message];
    if (maybeCode !== undefined) parts.push(`code: ${String(maybeCode)}`);
    if (maybeStderr !== undefined && String(maybeStderr).length > 0) {
      parts.push(`stderr: ${String(maybeStderr).trim()}`);
    }
    return parts.join(" | ");
  }
  return String(err);
}
