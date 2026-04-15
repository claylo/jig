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
  ResourceTemplate,
  fromJsonSchema,
  type CallToolResult,
  type GetPromptResult,
  type JsonSchemaType,
  type ReadResourceResult,
  type ReadResourceTemplateCallback,
  type RegisteredPrompt,
  type RegisteredResource,
  type RegisteredResourceTemplate,
  type RegisteredTool,
  type ResourceMetadata,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
  type ToolCallback,
  type Transport,
} from "@modelcontextprotocol/server";
import type { JigConfig } from "./config.ts";
import { render } from "./util/template.ts";

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

/**
 * Spec for registering one prompt. argsSchema is a JSON Schema object
 * whose properties describe the prompt's named arguments. Pass undefined
 * for a no-argument prompt.
 */
export interface RegisterPromptSpec {
  description?: string;
  argsSchema?: JsonSchemaObject;
}

/** Re-export so prompts.ts can type the return value without touching the SDK. */
export type RegisteredPromptHandle = RegisteredPrompt;

/**
 * Minimal spec a caller passes into registerResource. Mirrors the shape
 * of SDK's ResourceMetadata sans uri/name (which travel separately).
 */
export interface RegisterResourceSpec {
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Per-process subscription state. Single-client stdio transport =
 * one Set<uri>. A future multi-client HTTP transport swaps this for a
 * per-session Map.
 */
export interface SubscriptionTracker {
  isSubscribed(uri: string): boolean;
}

/** Handler signature for a resource read. */
export type ResourceHandler = (uri: URL) => Promise<ReadResourceResult>;

/** Re-export of SDK's RegisteredResource so sibling modules stay off the SDK. */
export type RegisteredResourceHandle = RegisteredResource;

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
  /**
   * Register one resource at a static URI. The adapter forwards to
   * McpServer.registerResource, which auto-wires resources/list,
   * resources/templates/list, and resources/read request handlers on
   * first call and sets capabilities.resources.listChanged.
   */
  registerResource(
    uri: string,
    spec: RegisterResourceSpec,
    handler: ResourceHandler,
  ): RegisteredResource;
  /**
   * Register a URI-template resource. The SDK auto-wires
   * resources/templates/list and handles RFC 6570 variable extraction
   * on resources/read. list: undefined means the template does not
   * enumerate on resources/list.
   */
  registerResourceTemplate(
    name: string,
    template: string,
    metadata: { description?: string; mimeType?: string },
    handler: (uri: URL, variables: Record<string, string>) => Promise<ReadResourceResult>,
  ): RegisteredResourceTemplate;
  /**
   * Wire resources/subscribe + resources/unsubscribe request handlers
   * on the underlying Server (McpServer's high-level class omits them)
   * and declare capabilities.resources.subscribe: true. Returns a
   * tracker so watchers can gate emit on subscription state.
   *
   * MUST be called before server.connect(). Call order: registerResource
   * for all resources, then trackSubscriptions, then connect.
   */
  trackSubscriptions(): SubscriptionTracker;
  /**
   * Fire notifications/resources/updated for a URI. Watchers call this
   * unconditionally — the subscription gate lives at the watcher layer
   * (startWatchers), so callers only reach this path when
   * tracker.isSubscribed(uri) === true.
   */
  sendResourceUpdated(uri: string): Promise<void>;
  /**
   * Register one prompt. The adapter bridges argsSchema via
   * fromJsonSchema so McpServer.registerPrompt accepts it.
   * Auto-wires prompts/list + prompts/get and advertises
   * capabilities.prompts.listChanged.
   */
  registerPrompt(
    name: string,
    spec: RegisterPromptSpec,
    handler: (args: Record<string, string>) => GetPromptResult,
  ): RegisteredPromptHandle;
  /** Attach to a transport and begin serving. */
  connect(transport: Transport): Promise<void>;
}

export function createServer(
  config: JigConfig,
  probe: Record<string, unknown>,
): JigServerHandle {
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
            description: render(spec.description, { probe }),
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
          description: render(spec.description, { probe }),
          ...(spec.title !== undefined && { title: spec.title }),
          ...(spec.annotations !== undefined && {
            annotations: spec.annotations,
          }),
        },
        cb as ToolCallback,
      );
    },
    registerResource(uri, spec, handler) {
      const metadata: ResourceMetadata = {};
      if (spec.description !== undefined) metadata.description = spec.description;
      if (spec.mimeType !== undefined) metadata.mimeType = spec.mimeType;
      // SDK signature: registerResource(name, uriOrTemplate: string, config, readCallback).
      // `handler: ResourceHandler` already satisfies SDK's ReadResourceCallback —
      // unlike registerTool above, there is no generic-inference workaround to
      // preserve, so pass it directly.
      return server.registerResource(spec.name, uri, metadata, handler);
    },
    registerResourceTemplate(name, templateStr, metadata, handler) {
      const tmpl = new ResourceTemplate(templateStr, { list: undefined });
      const resourceMetadata: ResourceMetadata = {};
      if (metadata.description !== undefined) resourceMetadata.description = metadata.description;
      if (metadata.mimeType !== undefined) resourceMetadata.mimeType = metadata.mimeType;
      const cb: ReadResourceTemplateCallback = (uri, variables) =>
        handler(uri, variables as Record<string, string>);
      return server.registerResource(name, tmpl, resourceMetadata, cb);
    },
    trackSubscriptions() {
      const subscribed = new Set<string>();
      // Reach into the low-level Server. The SDK's McpServer class
      // exposes its underlying Server via the `server` property
      // (dist/index.d.mts:502). Subscribe/unsubscribe are not wired by
      // the high-level class, so we register them ourselves. The
      // generic on setRequestHandler infers request shape from the
      // method literal (RequestTypeMap["resources/subscribe"] etc.).
      const lowLevel = server.server;
      lowLevel.registerCapabilities({ resources: { subscribe: true } });
      lowLevel.setRequestHandler("resources/subscribe", async (req) => {
        subscribed.add(req.params.uri);
        return {};
      });
      lowLevel.setRequestHandler("resources/unsubscribe", async (req) => {
        subscribed.delete(req.params.uri);
        return {};
      });
      return {
        isSubscribed(uri: string) {
          return subscribed.has(uri);
        },
      };
    },
    async sendResourceUpdated(uri) {
      await server.server.sendResourceUpdated({ uri });
    },
    registerPrompt(name, spec, handler) {
      const argsSchema: StandardSchemaWithJSON | undefined =
        spec.argsSchema !== undefined
          ? fromJsonSchema(spec.argsSchema)
          : undefined;
      if (argsSchema !== undefined) {
        const cb: unknown = (args: Record<string, string>) => handler(args);
        return server.registerPrompt(
          name,
          {
            ...(spec.description !== undefined && { description: spec.description }),
            argsSchema,
          },
          cb as Parameters<typeof server.registerPrompt>[2],
        );
      }
      const cb: unknown = () => handler({});
      return server.registerPrompt(
        name,
        {
          ...(spec.description !== undefined && { description: spec.description }),
        },
        cb as Parameters<typeof server.registerPrompt>[2],
      );
    },
    async connect(transport: Transport) {
      await server.connect(transport);
    },
  };
}
