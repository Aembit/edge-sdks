# Aembit Edge TypeScript SDK

TypeScript SDK for interacting with the Aembit Edge API.

This SDK is the reference implementation for behavior and concepts used by other language SDKs in this repository.

## Status

The TypeScript SDK is in active development.

## Runtime And Packaging

- Node.js-first SDK target: `>=18`
- Package output: ESM-only

## v1 Scope

Planned v1 behavior:

- high-level Edge client for authentication and credential retrieval
- automatic token lifecycle management
- retry logic for transient failures
- built-in Trust Provider coverage focused on AWS and OIDC

## Documentation

- Implementation and agent guidance: `ts/AGENTS.md`
- Cross-language contracts and API snapshots: `spec/` and `spec/openapi/`

## Planned Layout

Expected TypeScript SDK structure:

- `ts/src/` SDK source code
- `ts/examples/` runnable examples
- colocated tests as `*.test.ts` beside source files

## Testing

- Test runner: Vitest
- Local development and test commands should use `npm`

## Roadmap Notes

- Additional Trust Provider support beyond AWS and OIDC
- Bundler/tooling decision is pending; package output remains ESM-only

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
