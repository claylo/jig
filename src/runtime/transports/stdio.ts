// SDK adapter for stdio transport. See src/runtime/server.ts for the
// rationale — keep all direct SDK imports quarantined here and in
// server.ts.
//
// SDK note: @modelcontextprotocol/server@2.0.0-alpha.2 ships the stdio
// transport from the package root, not a "/stdio" subpath (the package's
// "exports" map only exposes "."). If a future alpha splits stdio into a
// subpath or a separate @modelcontextprotocol/node package, adjust here.

import {
  StdioServerTransport,
  type Transport,
} from "@modelcontextprotocol/server";

export function createStdioTransport(): Transport {
  return new StdioServerTransport();
}
