// SDK adapter. All direct imports of @modelcontextprotocol/server live here
// (plus transports/stdio.ts). Rationale: SDK 2.x is fresh alpha and its
// surface may shift before 2.0 ships — quarantining the dependency here
// makes an API change a one/two-file edit.
//
// SDK surface discovered in @modelcontextprotocol/server@2.0.0-alpha.2:
//   - Two server classes ship: `McpServer` (high-level, what we use) and
//     `Server` (low-level, marked @deprecated at dist/index.d.mts:353).
//     We use McpServer exclusively.
//   - `new McpServer(serverInfo: Implementation, options?: ServerOptions)`
//     where `Implementation` is { name, version, title?, description?,
//     websiteUrl?, icons? } and `ServerOptions.capabilities` takes the
//     same shape as Server's (tools.listChanged, resources.listChanged,
//     prompts.listChanged, ...). McpServer's constructor just forwards
//     to `new Server(serverInfo, options)` (index.mjs:932), so the
//     capabilities we declare up-front reach the wire even when no tools
//     are registered yet.
//   - `registerTool(name, config, cb)`:
//       config = { title?, description?, inputSchema?, outputSchema?,
//                  annotations?, _meta? }
//       inputSchema/outputSchema are `StandardSchemaWithJSON` — the
//       Standard Schema Spec dialect that Zod v4, ArkType, and Valibot
//       implement (dist/index-Bhfkexnj.d.mts:9635).
//     Importantly, `registerTool` is the *only* place McpServer wires up
//     its internal `tools/list` and `tools/call` request handlers
//     (index.mjs:1335, `setToolRequestHandlers`). Until the first tool is
//     registered, those methods are not served. That's fine for Phase 3
//     (this phase) because the `initialize` handshake is set up by the
//     underlying Server class at construction time and does not depend on
//     tool handlers. Phase 4 adds real tools and flips the list/call
//     handlers on.
//   - `fromJsonSchema(schema, validator?)` (dist/index.d.mts:1203) is
//     exported from the package root. It takes a JSON Schema 2020-12
//     object (`JsonSchemaType = JSONSchema.Interface` from
//     `json-schema-typed`) and returns a `StandardSchemaWithJSON`. This
//     is the bridge jig uses: Phase 4 produces a JSON Schema from the
//     typed `InputFieldSchema`s in YAML, and this adapter feeds it
//     through `fromJsonSchema` so `McpServer.registerTool` accepts it
//     without jig ever importing Zod.
//   - `StdioServerTransport` ships from the same package root — no
//     `/stdio` subpath (the package's "exports" map only exposes ".").
//     See transports/stdio.ts.
//   - `server.connect(transport)` attaches the transport and begins
//     serving. Same call shape as the deprecated `Server.connect`.
//
// Notes on `any`: `registerTool`'s generic inference is driven off the
// Standard Schema's phantom input/output types, which jig does not carry
// statically (our JSON Schema is data, not a type). The only boundary
// cast is the `ToolCallback` — see `registerTool` below.

import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
  type JsonSchemaType,
  type RegisteredTool,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
import type { JigConfig } from "./config.ts";

/**
 * Lean alias for the JSON Schema shape jig passes across the adapter
 * boundary. Phase 4's `toolToInputSchema()` will produce values of this
 * type. Re-exported from the SDK so callers don't need to import the
 * SDK directly.
 */
export type JsonSchemaObject = JsonSchemaType;

/** Handler signature for a single registered tool. */
export type ToolHandler = (args: unknown) => Promise<CallToolResult>;

/** Minimal spec a caller passes into `registerTool`. */
export interface RegisterToolSpec {
  description: string;
  /**
   * JSON Schema 2020-12 describing the tool's input object. Pass
   * `undefined` for a no-argument tool.
   */
  inputSchema?: JsonSchemaObject;
  title?: string;
  annotations?: ToolAnnotations;
}

export interface JigServerHandle {
  /**
   * Register one tool with the underlying McpServer. The adapter
   * translates jig's JSON Schema input to the SDK's StandardSchema shape
   * via `fromJsonSchema`. Returns the SDK's `RegisteredTool` handle so
   * callers can later `update()` / `remove()` / `enable()` / `disable()`
   * the registration — Phase 4 ignores this return value; the eventual
   * YAML hot-reload plan will consume it.
   */
  registerTool(
    name: string,
    spec: RegisterToolSpec,
    handler: ToolHandler,
  ): RegisteredTool;
  /** Attach to a transport and begin serving. */
  connect(transport: Transport): Promise<void>;
}

export function createServer(config: JigConfig): JigServerHandle {
  const server = new McpServer(
    {
      name: config.server.name,
      version: config.server.version,
      ...(config.server.description !== undefined && {
        description: config.server.description,
      }),
    },
    {
      capabilities: {
        // Accurate up front: a later plan adds YAML hot-reload, which
        // will call sendToolListChanged(). Pre-declaring the capability
        // also means `initialize` advertises it even before Phase 4
        // registers the first tool.
        tools: { listChanged: true },
      },
      ...(config.server.instructions !== undefined && {
        instructions: config.server.instructions,
      }),
    },
  );

  return {
    registerTool(name, spec, handler) {
      // Bridge jig's JSON Schema into the SDK's StandardSchemaWithJSON.
      // `undefined` input means no-args; fromJsonSchema() is not called
      // in that case.
      const inputSchema: StandardSchemaWithJSON | undefined =
        spec.inputSchema !== undefined
          ? fromJsonSchema(spec.inputSchema)
          : undefined;

      // McpServer.registerTool's callback type is a conditional on the
      // schema generic (dist/index.d.mts:732):
      //   - With schema:    `(args, ctx) => ...`  (args first, ctx second)
      //   - Without schema: `(ctx)       => ...`  (ctx is the only arg)
      // Confirmed in the SDK source at index.mjs:1498–1503 — the no-args
      // branch literally does `callback(ctx)`. So we MUST split the
      // closures per branch; a single `(args) => handler(args)` would
      // hand `ServerContext` to handlers that expect `undefined`. The
      // cast is only for the SDK's generic-inference boundary; the
      // runtime shapes are correct on both sides.
      if (inputSchema !== undefined) {
        const cb: unknown = (args: unknown) => handler(args);
        return server.registerTool(
          name,
          {
            description: spec.description,
            inputSchema,
            ...(spec.title !== undefined && { title: spec.title }),
            ...(spec.annotations !== undefined && {
              annotations: spec.annotations,
            }),
          },
          cb as ToolCallback<StandardSchemaWithJSON>,
        );
      }
      // No-schema branch: the SDK invokes the callback with `ctx` in
      // position 0. Drop it and feed the handler `undefined`.
      const cb: unknown = () => handler(undefined);
      return server.registerTool(
        name,
        {
          description: spec.description,
          ...(spec.title !== undefined && { title: spec.title }),
          ...(spec.annotations !== undefined && {
            annotations: spec.annotations,
          }),
        },
        cb as ToolCallback,
      );
    },
    async connect(transport: Transport) {
      await server.connect(transport);
    },
  };
}
