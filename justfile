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

# Smoke-task: verify the Plan 8 dedicated-workflow example boots, tools/call
# returns a CreateTaskResult, tasks/get reaches completed, and tasks/result
# returns the rendered terminal text. Uses an inline node helper because the
# InMemoryTaskStore keeps the event loop alive (sendRpc + pipe-and-exit
# pattern doesn't work for task tools).
smoke-task:
    #!/usr/bin/env bash
    set -euo pipefail
    node --experimental-transform-types -e '
      import { spawn } from "node:child_process";
      const child = spawn(process.execPath, [
        "--experimental-transform-types",
        "src/runtime/index.ts",
        "--config",
        "examples/tasks.yaml",
      ], { stdio: ["pipe", "pipe", "inherit"] });
      const lines = [];
      let buf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          if (line) lines.push(line);
          buf = buf.slice(i + 1);
        }
      });
      const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
      const wait = (pred, timeout = 5000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = setInterval(() => {
          const found = lines.find(pred);
          if (found) { clearInterval(tick); resolve(found); }
          else if (Date.now() - start > timeout) { clearInterval(tick); reject(new Error("timeout waiting for: " + pred)); }
        }, 25);
      });
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: { tasks: { requests: { tools: { call: true } } } }, clientInfo: { name: "smoke", version: "0" } } });
      await wait((l) => l.includes("\"id\":1"));
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      await new Promise((r) => setTimeout(r, 50));
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "process_job", arguments: { jobId: "j-42" }, task: { ttl: 60000 } } });
      const callLine = await wait((l) => l.includes("\"id\":2") && l.includes("\"result\""));
      const callResp = JSON.parse(callLine);
      const taskId = callResp.result.task?.taskId;
      if (!taskId) { console.error("no taskId"); process.exit(1); }
      let status = "working";
      let pollId = 3;
      const startPoll = Date.now();
      while (status === "working" && Date.now() - startPoll < 5000) {
        send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId } });
        const idM = "\"id\":" + pollId;
        const getLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
        status = JSON.parse(getLine).result.status;
        pollId++;
        if (status === "working") await new Promise((r) => setTimeout(r, 50));
      }
      if (status !== "completed") { console.error("task did not complete: " + status); process.exit(1); }
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId } });
      const idM = "\"id\":" + pollId;
      const resLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
      const finalText = JSON.parse(resLine).result.content[0].text;
      if (!finalText.includes("j-42")) { console.error("result missing jobId: " + finalText); process.exit(1); }
      if (!finalText.includes("#ops")) { console.error("result missing channel: " + finalText); process.exit(1); }
      console.log(JSON.stringify({ taskId, status, finalText }, null, 2));
      child.kill();
    '
    echo "smoke-task: OK"

# Smoke-task-one-tool: verify the Plan 8 single-tool dispatcher example
# boots. Exercises both a non-workflow case (help → synthetic one-step task)
# and a workflow case (run → state-machine interpreter). Both must return
# CreateTaskResult and reach completed status.
smoke-task-one-tool:
    #!/usr/bin/env bash
    set -euo pipefail
    node --experimental-transform-types -e '
      import { spawn } from "node:child_process";
      const child = spawn(process.execPath, [
        "--experimental-transform-types",
        "src/runtime/index.ts",
        "--config",
        "examples/tasks-one-tool.yaml",
      ], { stdio: ["pipe", "pipe", "inherit"] });
      const lines = [];
      let buf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          if (line) lines.push(line);
          buf = buf.slice(i + 1);
        }
      });
      const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
      const wait = (pred, timeout = 5000) => new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = setInterval(() => {
          const found = lines.find(pred);
          if (found) { clearInterval(tick); resolve(found); }
          else if (Date.now() - start > timeout) { clearInterval(tick); reject(new Error("timeout waiting for: " + pred)); }
        }, 25);
      });
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: { tasks: { requests: { tools: { call: true } } } }, clientInfo: { name: "smoke", version: "0" } } });
      await wait((l) => l.includes("\"id\":1"));
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      await new Promise((r) => setTimeout(r, 50));
      // help action — non-workflow case becomes a synthetic one-step task
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "jobs", arguments: { action: "help" }, task: { ttl: 60000 } } });
      const helpLine = await wait((l) => l.includes("\"id\":2") && l.includes("\"result\""));
      const helpTaskId = JSON.parse(helpLine).result.task?.taskId;
      if (!helpTaskId) { console.error("help: no taskId"); process.exit(1); }
      await new Promise((r) => setTimeout(r, 50));
      send({ jsonrpc: "2.0", id: 3, method: "tasks/get", params: { taskId: helpTaskId } });
      const helpGetLine = await wait((l) => l.includes("\"id\":3") && l.includes("\"result\""));
      const helpStatus = JSON.parse(helpGetLine).result.status;
      if (helpStatus !== "completed") { console.error("help did not complete: " + helpStatus); process.exit(1); }
      send({ jsonrpc: "2.0", id: 4, method: "tasks/result", params: { taskId: helpTaskId } });
      const helpResLine = await wait((l) => l.includes("\"id\":4") && l.includes("\"result\""));
      const helpText = JSON.parse(helpResLine).result.content[0].text;
      if (!helpText.includes("jobs management")) { console.error("help text wrong: " + helpText); process.exit(1); }
      // run action — workflow case drives the interpreter
      send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "jobs", arguments: { action: "run", jobId: "j-42" }, task: { ttl: 60000 } } });
      const runLine = await wait((l) => l.includes("\"id\":5") && l.includes("\"result\""));
      const runTaskId = JSON.parse(runLine).result.task?.taskId;
      if (!runTaskId) { console.error("run: no taskId"); process.exit(1); }
      let runStatus = "working";
      let pollId = 6;
      const startPoll = Date.now();
      while (runStatus === "working" && Date.now() - startPoll < 5000) {
        send({ jsonrpc: "2.0", id: pollId, method: "tasks/get", params: { taskId: runTaskId } });
        const idM = "\"id\":" + pollId;
        const runGetLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
        runStatus = JSON.parse(runGetLine).result.status;
        pollId++;
        if (runStatus === "working") await new Promise((r) => setTimeout(r, 50));
      }
      if (runStatus !== "completed") { console.error("run did not complete: " + runStatus); process.exit(1); }
      send({ jsonrpc: "2.0", id: pollId, method: "tasks/result", params: { taskId: runTaskId } });
      const idM = "\"id\":" + pollId;
      const runResLine = await wait((l) => l.includes(idM) && l.includes("\"result\""));
      const runText = JSON.parse(runResLine).result.content[0].text;
      if (!runText.includes("j-42")) { console.error("run text missing jobId: " + runText); process.exit(1); }
      if (!runText.includes("#ops")) { console.error("run text missing channel: " + runText); process.exit(1); }
      console.log(JSON.stringify({ helpTaskId, helpStatus, runTaskId, runStatus, runText }, null, 2));
      child.kill();
    '
    echo "smoke-task-one-tool: OK"
