# Aembit Edge TypeScript SDK

TypeScript SDK for interacting with the Aembit Edge API.

This SDK is the reference implementation for behavior and concepts used by other language SDKs in this repository.

## Status

The TypeScript SDK is in active development.

## Runtime And Packaging

- Node.js-first SDK target: `>=20`
- Package output: ESM-only

## v1 Scope

Planned v1 behavior:

- high-level Edge client for authentication and credential retrieval
- automatic token lifecycle management
- retry logic for transient failures
- built-in Trust Provider coverage focused on AWS and OIDC

## Client API (Current)

The SDK now exposes `EdgeClient` as the developer-facing API.

```ts
import { EdgeClient } from "@aembit/edge-sdk-ts"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-client-id",
  trustProvider: {
    id: "aws-metadata-service",
    kind: "aws_metadata_service",
    async collectIdentity() {
      return {
        aws: {
          instanceIdentityDocument: "..."
        }
      }
    }
  }
})

await client.authenticate()

const credential = await client.getCredential({
  server: {
    host: "db.internal",
    port: 443
  }
})
```

Notes:

- `authenticate()` updates SDK session state and does not return raw bearer tokens.
- `getCredential()` auto-authenticates when no valid token is cached.
- `server.host` and `server.port` are required.
- `server.transportProtocol` currently supports only `"TCP"` and defaults to `"TCP"` if omitted.

## Documentation

- Implementation and agent guidance: `ts/AGENTS.md`
- TypeScript architecture design: `ts/architecture.md`
- Cross-language contracts and API snapshots: `spec/` and `spec/openapi/`
- Cross-language architecture: `docs/architecture.md`

## Local Development

Run from `ts/`:

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`

Package status:

- `ts/package.json` is currently marked `private: true`.
- Revisit package publish metadata and release workflow when publish work starts.

## Planned Layout

Expected TypeScript SDK structure:

- `ts/src/` SDK source code
- `ts/examples/` runnable examples
- colocated tests as `*.test.ts` beside source files

## Testing

- Test runner: Vitest
- Local development and test commands should use `npm`

## Troubleshooting

- Verify runtime version: `node -v` (must be `>=20`).
- Some IDE, CI, or coding-agent shells may use a different Node version than your interactive terminal.
- If commands fail with runtime/tooling import errors, switch to Node `>=20` and reinstall dependencies:
  - `npm install` (or `npm ci` in clean environments)

## Roadmap Notes

- Additional Trust Provider support beyond AWS and OIDC
- Bundler/tooling decision is pending; package output remains ESM-only

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
