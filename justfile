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
