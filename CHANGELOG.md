# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project intends to follow Semantic Versioning once stable release automation is in place.

## [Unreleased]

### Added

- Public package metadata for the monorepo packages, including repository, homepage, issue tracker and public publish configuration.
- GitHub Actions CI for dependency installation, type checking, build and test verification on Node.js 22.12.0.
- Security reporting policy in `SECURITY.md`.

### Changed

- The management CLI executable is `shcli`.
- The stdio MCP server executable remains `shmcp`.
- The HTTP MCP server executable remains `shmcp-http`.
- Developer Runtime capability descriptions now clarify HTTP runtime sharing semantics.
- Restricted task script-path validation resolves script arguments relative to the configured task working directory while preserving project-root confinement.

### Security

- Untrusted projects operate in read-only mode and cannot execute shell tasks.
- Git read operations disable external diff/textconv and fsmonitor execution paths.
- Filesystem and project-detection paths are confined to registered project roots.
- HTTP access supports Bearer authentication, Host validation, request size limits and rate limiting.

## [0.1.0] - Unreleased

Initial public release candidate.
