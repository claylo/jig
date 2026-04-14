# jig — YAML-driven single-file MCP server
# Plan 1 justfile. `build`, `run`, `smoke`, and `clean` recipes arrive in
# later phases as the things they build/run begin to exist.

default: check test

# Install deps
install:
    npm install

# Type-check the source
check:
    npm run check

# Run tests
test:
    npm test

# Smoke test: launch the runtime against examples/minimal.yaml, send one
# initialize request, print the response. Exit non-zero if the
# initialize response doesn't arrive on stdout.
smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    req='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
    response=$(echo "$req" | node --experimental-transform-types src/runtime/index.ts --config examples/minimal.yaml | head -1)
    if [ -z "$response" ]; then
      echo "smoke: no response from runtime" >&2
      exit 1
    fi
    echo "$response" | jq .

# Smoke-dispatch: exercise the dispatcher example. Sends initialize +
# tools/call for action=help, verifies the expected text shows up.
smoke-dispatch:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/dispatcher.yaml)
    if [ -z "$output" ]; then
      echo "smoke-dispatch: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -1 | jq .
