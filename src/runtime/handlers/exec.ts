import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecHandler } from "../config.ts";
import { errorResult, type ToolCallResult, type InvokeContext } from "./types.ts";
import { render } from "../util/template.ts";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB, matches Node.js default

/**
 * Each element of handler.exec is rendered independently through Mustache
 * and becomes exactly one argv entry — no whitespace splitting, no
 * argument injection. Explicitly not a shell: `shell: true` is never set.
 * See ADR-0006.
 */
export async function invokeExec(
  handler: ExecHandler,
  args: Record<string, unknown>,
  ctx: InvokeContext,
): Promise<ToolCallResult> {
  const templateCtx = { ...args, probe: ctx.probe };
  const argv = handler.exec.map((part) => render(part, templateCtx));

  if (argv.length === 0) {
    return errorResult("exec: empty command array");
  }

  const [command, ...commandArgs] = argv;

  try {
    const maxBuffer = handler.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const { stdout } = await execFileAsync(command!, commandArgs, { maxBuffer });
    return { content: [{ type: "text", text: stdout }] };
  } catch (err: unknown) {
    return errorResult(formatError(err));
  }
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
