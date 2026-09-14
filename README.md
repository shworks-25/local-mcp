# local-mcp

A secure local developer runtime and Model Context Protocol (MCP) server for AI-assisted coding on macOS and other Unix-like development environments.

`local-mcp` gives AI clients structured access to local projects without exposing an unrestricted shell. It combines project trust, filesystem confinement, safe Git reads, controlled task execution, Developer Runtime state, workspace snapshots, and stdio/HTTP MCP transports.

## Status

This project is currently in early development (`0.1.0`). The security model is intentionally conservative and may evolve before a stable release.

## Features

- Project registration, discovery, trust and permission management
- Safe filesystem browsing, search, reading, writing and exact text replacement
- Protected path rules for `.git`, `.env`, private keys, `.devmcp.yaml` and other sensitive files
- Safe Git status, diff and log operations with external diff/textconv/fsmonitor protections
- Restricted task execution using structured `program + args` instead of shell command strings
- Project-root anchored executable allowlists
- Test, typecheck and lint execution
- Package script discovery and controlled execution
- Symbol definition/reference lookup
- Developer Runtime process management with `dev_start`, `dev_logs`, `dev_stop` and `dev_list`
- Workspace snapshots, restore previews and controlled restore
- Security scanning for risky project configuration and suspicious code patterns
- MCP over stdio and HTTP
- Loopback Host/Origin/Referer/Fetch-Metadata checks for local HTTP mode
- Request body, rate-limit, process-output and runtime resource limits

## Security model

The project is designed around four layers:

```text
Global policy
    ↓
Project trust and project policy
    ↓
Developer Runtime
    ↓
Filesystem / Git / process / MCP tools
```

### Project trust

Newly registered and auto-discovered projects are untrusted by default.

An untrusted project is treated as read-only:

- filesystem reads may be allowed by policy
- writes and deletes are disabled
- shell/task execution is disabled
- workspace restore is disabled
- repository-provided `AGENTS.md` content is not automatically injected into project context

Trust must be granted locally through the CLI:

```bash
shdev project trust <name>
```

Trust can be revoked with:

```bash
shdev project untrust <name>
```

### Restricted execution is not a sandbox

Restricted mode limits executable resolution, arguments, environment variables and project-local executables. It does **not** provide operating-system sandboxing.

Package managers and build tools can execute project code. Task execution therefore still requires an explicitly trusted project.

### Protected files

Default protected patterns include:

```text
.git
.git/**
.vscode/**
.idea/**
.env
.env.*
*.pem
*.key
*.p12
*.pfx
id_rsa
id_ed25519
.devmcp.yaml
```

Protected files cannot be read or modified through normal filesystem MCP tools.

## Requirements

- Node.js `>= 22.12.0`
- pnpm
- macOS or another Unix-like development environment is the primary target

Optional tools such as Git, ripgrep, Go, Swift, Flutter or Gradle are required only for the related project features.

## Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Clean generated output:

```bash
pnpm clean
```

## CLI

After building or installing the package, the primary CLI is:

```bash
shdev
```

Useful commands include:

```bash
shdev project add <path>
shdev project list
shdev project trust <name>
shdev project untrust <name>
shdev doctor
shdev config
shdev start
```

## MCP stdio server

The stdio MCP executable is:

```bash
shdev-mcp
```

For development:

```bash
pnpm dev:mcp
```

## MCP HTTP server

The HTTP executable is:

```bash
shdev-mcp-http
```

Default configuration:

```text
Host: 127.0.0.1
Port: 8787
```

Supported environment variables:

```text
MCP_HOST
MCP_PORT
MCP_AUTH_TOKEN
MCP_ALLOW_INSECURE_HTTP
MCP_MAX_BODY_BYTES
```

Example:

```bash
MCP_AUTH_TOKEN="replace-with-a-strong-token" \
MCP_HOST="127.0.0.1" \
MCP_PORT="8787" \
shdev-mcp-http
```

Non-loopback HTTP requires authentication. Plain HTTP on a non-loopback address is rejected by default and must be explicitly enabled with:

```bash
MCP_ALLOW_INSECURE_HTTP=1
```

For remote access, prefer an HTTPS reverse proxy instead of exposing plaintext HTTP.

## Project configuration

Projects may define `.devmcp.yaml` for controlled tasks and project-specific restrictions.

Example:

```yaml
permissions:
  read: true
  write: true
  delete: false
  shell: restricted

commands:
  test:
    program: pnpm
    args: ["test"]
    cwd: "."
    timeoutMs: 120000

  typecheck:
    program: pnpm
    args: ["typecheck"]
    cwd: "."
    timeoutMs: 120000

  build:
    program: pnpm
    args: ["build"]
    cwd: "."
    timeoutMs: 180000
```

A project configuration can restrict the global policy further, but cannot elevate permissions beyond the global policy.

`.devmcp.yaml` itself is protected and symbolic links are rejected.

## Developer Runtime

Stateful tools use a Developer Runtime to keep bounded local state such as:

- recent test results
- managed development processes
- workspace snapshots

Runtime resources are bounded and can be reset without changing project files outside the controlled restore mechanism.

Representative tools include:

```text
test_run
test_failures
typecheck
lint
symbol_definition
symbol_references
dev_start
dev_list
dev_logs
dev_stop
package_scripts
package_run_script
workspace_snapshot
workspace_snapshot_list
workspace_restore_preview
workspace_restore
security_scan
runtime_status
runtime_capabilities
runtime_reset
```

## Homebrew

A Homebrew formula/tap is planned. Until an official formula is published, build the project from source using pnpm.

Before creating a release, the intended release gate is:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

A release should use an immutable Git tag and source archive with a verified SHA-256 checksum.

## Reporting security issues

Please avoid publishing exploitable security issues in a public issue before a fix is available. If a private security reporting channel is configured for the repository, use that channel first.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).
