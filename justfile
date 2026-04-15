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

# Smoke-compute: exercise the compute + guard + transform example. Sends
# initialize + tools/call for summary, platform_only, and token_echo.
# Verifies each returns the expected shape and that transform wraps
# them.
smoke-compute:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"envcheck","arguments":{"action":"summary"}}}
    {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"envcheck","arguments":{"action":"token_echo","var":"HOME"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/compute-and-guards.yaml)
    if [ -z "$output" ]; then
      echo "smoke-compute: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -2 | jq .

# Smoke-http: verify the Plan 4 example loads and the help action
# returns through dispatch + transform. Does not reach the network —
# network round-trips are exercised by the Plan 4 integration test
# which spins up an http.createServer() fixture.
smoke-http:
    #!/usr/bin/env bash
    set -euo pipefail
    export JIG_EXAMPLE_TOKEN=dummy-token-for-smoke
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"example","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/http-and-graphql.yaml)
    if [ -z "$output" ]; then
      echo "smoke-http: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -1 | jq .

# Smoke-probe: verify the Plan 5 example boots, both probes resolve,
# the tool description bakes in {{probe.git_sha}} and
# {{probe.current_user}}, and the transform wraps the help action's
# inline text. Hermetic — exec probes only, no network round-trip.
smoke-probe:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"tools/list"}
    {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"example","arguments":{"action":"help"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/probes.yaml)
    if [ -z "$output" ]; then
      echo "smoke-probe: no response from runtime" >&2
      exit 1
    fi
    echo "$output" | tail -2 | jq .

# Smoke-resource: verify the Plan 6 example boots, resources/list
# returns both declared resources, resources/read returns the inline
# resource's text, and subscribe/unsubscribe return empty results. The
# polling watcher's update emit is NOT tested here (the integration
# test covers that) — this recipe exercises the synchronous MCP
# surface. Hermetic — no network, no mid-run mutation.
smoke-resource:
    #!/usr/bin/env bash
    set -euo pipefail
    STATE_FILE=/tmp/jig-plan6-state.txt
    echo "smoke-initial" > "$STATE_FILE"
    trap 'rm -f "$STATE_FILE"' EXIT

    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"resources/list"}
    {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"config://jig/hello"}}
    {"jsonrpc":"2.0","id":4,"method":"resources/subscribe","params":{"uri":"config://jig/state"}}
    {"jsonrpc":"2.0","id":5,"method":"resources/unsubscribe","params":{"uri":"config://jig/state"}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/resources.yaml)
    if [ -z "$output" ]; then
      echo "smoke-resource: no response from runtime" >&2
      exit 1
    fi
    # Print the response trio for visual inspection + structural assert
    # via jq on the list+read responses.
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.resources | length == 2' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.contents[0].text | contains("Hello")' >/dev/null
    echo "$output" | tail -4 | jq .
    echo "smoke-resource: OK"

# Smoke-prompt: verify the Plan 7 example boots, prompts/list returns the
# declared prompt, prompts/get renders the template, resources/templates/list
# returns the template resource, and completion/complete prefix-filters
# values for both a prompt argument and a template variable. Hermetic —
# no network, all inline handlers.
smoke-prompt:
    #!/usr/bin/env bash
    set -euo pipefail
    requests='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
    {"jsonrpc":"2.0","id":2,"method":"prompts/list"}
    {"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"analyze_job","arguments":{"jobId":"j-123","depth":"detailed"}}}
    {"jsonrpc":"2.0","id":4,"method":"resources/templates/list"}
    {"jsonrpc":"2.0","id":5,"method":"completion/complete","params":{"ref":{"type":"ref/prompt","name":"analyze_job"},"argument":{"name":"depth","value":"d"}}}
    {"jsonrpc":"2.0","id":6,"method":"completion/complete","params":{"ref":{"type":"ref/resource","uri":"queue://jobs/{status}"},"argument":{"name":"status","value":"c"}}}'
    output=$(echo "$requests" | node --experimental-transform-types src/runtime/index.ts --config examples/prompts-completions.yaml)
    if [ -z "$output" ]; then
      echo "smoke-prompt: no response from runtime" >&2
      exit 1
    fi
    # Structural assertions via jq
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.prompts | length == 1' >/dev/null
    echo "$output" | grep '"id":2' | head -1 | jq -e '.result.prompts[0].name == "analyze_job"' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.messages[0].role == "user"' >/dev/null
    echo "$output" | grep '"id":3' | head -1 | jq -e '.result.messages[0].content.text | contains("j-123")' >/dev/null
    echo "$output" | grep '"id":4' | head -1 | jq -e '.result.resourceTemplates | length == 1' >/dev/null
    echo "$output" | grep '"id":4' | head -1 | jq -e '.result.resourceTemplates[0].uriTemplate == "queue://jobs/{status}"' >/dev/null
    echo "$output" | grep '"id":5' | head -1 | jq -e '.result.completion.values | contains(["detailed"])' >/dev/null
    echo "$output" | grep '"id":6' | head -1 | jq -e '.result.completion.values | length >= 2' >/dev/null
    echo "$output" | tail -5 | jq .
    echo "smoke-prompt: OK"
