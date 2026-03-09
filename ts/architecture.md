# TypeScript SDK Architecture

This document describes how the TypeScript SDK implements the cross-language architecture contract in `docs/architecture.md`.

## Scope

This is an initial architecture for v1.

v1 baseline:

- runtime target: Node.js `>=20`
- package output: ESM-only
- target API contract: Aembit Edge API v1 (`spec/openapi/api-1.yaml`)
- OpenAPI snapshot timestamp: `2026-03-07T17:37:55Z`
- initial Trust Provider coverage: AWS Metadata Service, AWS Role, and GitHub OIDC
- test framework: Vitest with colocated tests (`*.test.ts`)

## Layer Implementation

### 1) API Transport and Protocol Layer (`ts/src/internal/protocol`)

Purpose: HTTP execution and Edge API protocol handling.

Modules:

- `http-transport.ts`
  - fetch-based HTTP transport
  - timeout handling
  - retry middleware integration
- `edge-api.ts`
  - low-level methods:
    - `auth(...)` for `POST /edge/v1/auth`
    - `credentials(...)` for `POST /edge/v1/credentials`
- `types.ts`
  - protocol-aligned request/response types based on pinned OpenAPI
- `errors.ts`
  - normalized SDK errors and mapping from HTTP/API failures
- `retry.ts`
  - retry policy implementation (backoff + jitter)

Constraints:

- No public exports from this layer.
- No runtime-specific identity collection in this layer.

### 2) Trust Provider Layer (`ts/src/internal/trust-providers`)

Purpose: environment-specific identity retrieval.

Trust Provider interface:

```ts
export interface TrustProvider {
  readonly id: string;
  collectIdentity(): Promise<ClientWorkloadDetails>;
}
```

Initial implementations:

- `aws-metadata-service.ts`
  - retrieves identity signals from AWS Metadata Service
- `aws-role.ts`
  - retrieves identity signals for AWS Role-based trust configuration
- `github-oidc.ts`
  - retrieves GitHub OIDC identity token signals

Design notes:

- Provider mechanics remain internal.
- Public API exposes provider selection, not provider internals.
- Provider failures are wrapped into SDK-defined errors.

### 3) Developer Client Layer (`ts/src/client`)

Purpose: ergonomic public API.

Public exports:

- `EdgeClient`
- configuration and request/response types intended for SDK users
- `trustProviders` factory namespace for supported environments

Public methods:

- `authenticate(): Promise<AuthSession>`
- `getCredential(input: GetCredentialInput, options?): Promise<CredentialResult>`

Behavior:

- `authenticate()` performs explicit authentication but does not return raw token data.
- `getCredential()` authenticates automatically when token state is missing or expired.

## Public API Contract (v1)

### Client configuration

Configuration contract:

```ts
type EdgeClientConfig = {
  baseUrl: string;
  clientId: string;
  trustProvider: TrustProvider;
  resourceSet?: string;
  timeoutMs?: number;
  authExpirySkewMs?: number;
  retry?: Partial<RetryPolicy>;
};
```

Required fields:

- `baseUrl`
- `clientId`
- `trustProvider`

Optional fields:

- `resourceSet`
- `authExpirySkewMs` (default `60000`)
- network and retry configuration

### `authenticate()` return model

Return contract:

```ts
type AuthSession = {
  authenticated: true;
  expiresAt: string | null;
  trustProviderId: string;
};
```

Raw bearer tokens are not exposed by this return model.

### `getCredential()` request/response model

Public request model should be simpler than raw protocol payloads but still recognizable to developers reading the Edge API documentation.

Request contract:

```ts
type GetCredentialInput = {
  server: Record<string, unknown>;
  credentialType?: string;
};
```

Response contract:

```ts
type CredentialResult = {
  credentialType?: string;
  expiresAt?: string | null;
  data: Record<string, unknown>;
};
```

Credential data remains flexible by design.

## Token Lifecycle

Per-client in-memory token state:

- cache token and expiry
- apply expiry skew before treating token as valid (default `60s`)
- use a single in-flight authentication promise to prevent duplicate concurrent auth calls
- allow caller override of expiry skew through client configuration

Suggested internal model:

- `TokenManager` owned by each `EdgeClient` instance
- `getValidToken()` used by `getCredential()` path
- explicit invalidation on unrecoverable auth failures

## Retry Policy

Global retry defaults are enabled.

Developers can override defaults in `EdgeClient` config.

Initial retry scope:

- transport/network errors
- HTTP `429`
- selected HTTP `5xx` responses

Initial default values (subject to tuning):

- `enabled: true`
- `maxAttempts: 3`
- `baseDelayMs: 200`
- `maxDelayMs: 2000`
- jitter enabled

### Retry Behavior Summary (TypeScript)

TypeScript implementation details for retry behavior:

- Effective retry policy is computed from:
  1. SDK defaults
  2. transport-level retry overrides
  3. per-request retry overrides (highest precedence)
- Per-request override fields with `undefined` values do not erase transport-level defaults.
- HTTP retryability is determined using the effective policy:
  - default retryable status codes (`429` and `5xx`)
  - plus any configured `retryableStatusCodes`
- Deterministic local setup failures are non-retryable:
  - invalid URL construction
  - invalid request combinations (for example `GET` with body)
  - request-body serialization failures
- Successful (`2xx`) responses with empty or malformed JSON payloads are treated as non-retryable transport errors.
- Fetch execution failures (including common transient network failures) are treated as retryable transport failures unless the error is already mapped to a non-retryable SDK error.

## HTTP Response Code Handling (Edge API v1)

As of `spec/openapi/api-1.yaml` (retrieved `2026-03-07T17:37:55Z`), expected endpoint response codes are:

- `POST /edge/v1/auth`: `200`, `400`, `401`, `500`
- `POST /edge/v1/credentials`: `200`, `400`, `500`

Default handling for other status codes:

- unlisted `4xx`: map to normalized API/client errors and do not retry by default
- unlisted `5xx`: map to normalized API/server errors and apply retry policy

## Error Model

Planned error hierarchy:

- `EdgeSdkError` (base)
- `TransportError`
- `ApiError`
- `AuthError`
- `CredentialError`
- `TrustProviderError`

All errors should preserve relevant metadata and root cause where available.

## Module Layout (Planned)

```text
ts/
  src/
    index.ts
    client/
      edge-client.ts
      types.ts
    internal/
      protocol/
        edge-api.ts
        http-transport.ts
        retry.ts
        types.ts
        errors.ts
      trust-providers/
        interface.ts
        aws-metadata-service.ts
        aws-role.ts
        github-oidc.ts
      auth/
        token-manager.ts
```

## Testing Strategy

- Vitest for unit and integration-style tests
- colocated tests next to source files:
  - `edge-client.test.ts`
  - `token-manager.test.ts`
  - `aws-metadata-service.test.ts`
  - `aws-role.test.ts`
- deterministic tests for token expiry and retry timing (fake timers where needed)
- mocked network calls (no dependency on a live tenant)

## Open Questions

- bundler/tooling choice for package build remains open
- naming and typing depth for `GetCredentialInput.server` may be refined after first implementation pass
- per-call retry override is optional for v1 and can be introduced after base client behavior is stable
