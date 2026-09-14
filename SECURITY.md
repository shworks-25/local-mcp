# Security Policy

## Supported versions

`local-mcp` is currently in the `0.x` development phase. Security fixes are applied to the latest release line only unless otherwise stated in a release note.

## Reporting a vulnerability

Please do not publish exploitable security details in a public issue before a fix is available.

Preferred reporting path:

1. Open the repository's **Security** tab on GitHub.
2. Use **Report a vulnerability** / Private Vulnerability Reporting if it is enabled.
3. Include the affected version or commit, reproduction steps, expected impact, and any relevant logs or configuration with secrets removed.

If GitHub Private Vulnerability Reporting is not available, open a minimal public issue requesting a private reporting channel, but do **not** include exploit details, credentials, tokens, private keys, local paths containing sensitive information, or proof-of-concept payloads in that issue.

## Security-sensitive areas

Reports are especially useful for issues involving:

- project trust and permission bypasses
- filesystem root or symlink escapes
- protected-file access
- arbitrary command or process execution
- Git configuration or helper execution
- HTTP authentication, Host validation, request smuggling, or resource-exhaustion problems
- workspace snapshot/restore boundary violations
- credential, token, or secret disclosure

## Response expectations

Security reports will be triaged based on exploitability and impact. Confirmed vulnerabilities may be fixed privately before public disclosure. Release notes should avoid publishing weaponized exploit details unless there is a clear reason to do so.

## Scope

The restricted execution mode is a policy boundary, not an operating-system sandbox. Trusted project tasks may execute project-controlled code through package managers, build tools, interpreters, and other explicitly allowed programs.
