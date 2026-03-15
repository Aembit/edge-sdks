# TypeScript SDK Architecture

This document describes how the TypeScript SDK implements the cross-language architecture contract in `docs/architecture.md`.

## Scope

This is an initial architecture for v1.

v1 baseline:

- runtime target: Node.js `>=20`
- package output: ESM-only
- target API contract: Aembit Edge API v1 (`spec/openapi/api-1.yaml`)
- canonical API docs: `https://docs.aembit.io/api-guide/edge/`
- OpenAPI snapshot timestamp: `2026-03-07T17:37:55Z`
- built-in Trust Provider coverage: AWS Metadata Service (IMDSv2), AWS Role, and OIDC ID Token
- test framework: Vitest with colocated tests (`*.test.ts`)

## Layer Implementation

### 1) API Transport and Protocol Layer (`ts/src/internal/protocol`)

Purpose: HTTP execution and Aembit Edge API protocol handling.

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
  - retrieves IMDSv2 token, instance identity document, and signature
- `aws-role.ts`
  - resolves IAM role credentials from the AWS runtime
  - builds `client.aws.stsGetCallerIdentity.{headers,region}` for `/edge/v1/auth`
- `aws-role-signer.ts`
  - builds SigV4-signed AWS STS `GetCallerIdentity` request headers for AWS Role identity payloads
- `oidc-id-token.ts`
  - resolves a caller-supplied OIDC identity token source
  - builds `client.oidc.identityToken` for `/edge/v1/auth`

Design notes:

- Provider mechanics remain internal.
- Public API exposes provider selection, not provider internals.
- Provider failures are wrapped into SDK-defined errors.

### AWS Role Trust Provider Contract

This section defines the v1 contract for the AWS Role Trust Provider.

Public factory target:

```ts
trustProviders.awsRole(options)
```

Planned options contract:

```ts
type AwsRoleTrustProviderOptions = {
  id?: string;
  region: string;
  retry?: Partial<RetryPolicy>;
};
```

`region` is required for v1 to keep behavior explicit and deterministic.

Identity payload contract returned by `collectIdentity()`:

```ts
{
  aws: {
    stsGetCallerIdentity: {
      headers: Record<string, string>;
      region: string;
    };
  };
}
```

This matches the `AwsDTO.stsGetCallerIdentity` schema in `spec/openapi/api-1.yaml`.

### OIDC ID Token Trust Provider Contract

This section defines the v1 contract for the OIDC ID Token Trust Provider.

Public factory target:

```ts
trustProviders.oidcIdToken(options)
```

Planned options contract:

```ts
type OidcIdTokenTrustProviderOptions = {
  id?: string;
  identityToken: string | (() => string | Promise<string>);
  retry?: Partial<RetryPolicy>;
};
```

`identityToken` is caller-supplied by design.

The SDK does not attempt to discover OIDC tokens automatically because token
retrieval is runtime-specific. Depending on the platform, the token may come
from a request header, an environment variable, a metadata endpoint, or a
platform SDK call. The application is therefore responsible for providing the
raw token value or a lazy token source, and the Trust Provider is responsible
for sending it in the Aembit request shape.

Examples:

```ts
createOidcIdTokenTrustProvider({
  identityToken: process.env.VERCEL_OIDC_TOKEN ?? ""
})
```

```ts
createOidcIdTokenTrustProvider({
  identityToken: () => request.headers.get("x-vercel-oidc-token") ?? ""
})
```

```ts
createOidcIdTokenTrustProvider({
  identityToken: async () => await getPlatformOidcToken()
})
```

Identity payload contract returned by `collectIdentity()`:

```ts
{
  oidc: {
    identityToken: string;
  };
}
```

This matches the `ClientWorkloadDetails.oidc -> IdentityTokenAttestationDTO`
schema in `spec/openapi/api-1.yaml`.

Roadmap note:

- `oidc`, `github`, `terraform`, and `gitlab` all use
  `IdentityTokenAttestationDTO`
- add a shared internal abstraction for JWT identity-token-based Trust Providers
  when those additional providers are implemented
- keep `gcp` separate even though it overlaps on `identityToken`, because
  `GcpAttestationDTO` also supports `instanceDocument`

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
  clientWorkloadDetails?: EdgeClientWorkloadDetails;
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

- `clientWorkloadDetails`
- `resourceSet`
- `authExpirySkewMs` (default `60000`)
- network and retry configuration

### Client workload detail merge behavior

`EdgeClient` may merge optional `clientWorkloadDetails` into the `client`
payload sent to `/edge/v1/auth` and `/edge/v1/credentials`.

Merge rules:

- Trust Provider-collected identity is authoritative
- `clientWorkloadDetails` supplements only missing key paths
- collisions preserve the Trust Provider value, including explicit `null`
- nested objects merge recursively when both sides are objects

Example:

- Trust Provider: `aws.stsGetCallerIdentity`
- caller-supplied details: `os.environment.CLIENT_WORKLOAD_ID`
- result: both are present in the final `client` payload

This allows additional workload metadata such as `CLIENT_WORKLOAD_ID` to be
sent alongside attested identity without allowing caller-supplied data to
override Trust Provider-owned fields.

Roadmap note:

- add runtime validation for `clientWorkloadDetails` against the pinned
  `ClientWorkloadDetails` schema in `spec/openapi/api-1.yaml`
- reject unsupported keys locally with SDK errors instead of surfacing Edge `400`
  responses

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

Public request model should be simpler than raw protocol payloads but still recognizable to developers reading the Aembit Edge API documentation.

Request contract:

```ts
type GetCredentialInput = {
  server: {
    host: string;
    port: number;
    transportProtocol?: "TCP";
  };
  credentialType?: string;
};
```

`transportProtocol` defaults to `"TCP"` when omitted.

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
- scope auth-session reuse by:
  - `resourceSet`
  - Trust Provider `authCacheKey` when the provider supplies one

Suggested internal model:

- `TokenManager` owned by each `EdgeClient` instance
- `getValidToken()` used by `getCredential()` path
- explicit invalidation on unrecoverable auth failures

## Caching Behavior

This section describes what the SDK caches today in plain terms.

### Authentication token caching

`EdgeClient` caches the Aembit bearer token returned by `/edge/v1/auth` in
memory.

Current behavior:

- the cache is per `EdgeClient` instance
- the cached token is reused until it expires
- expiry handling uses the configured auth-expiry skew (default `60s`)
- auth-session reuse is scoped by `resourceSet`
- auth-session reuse is also scoped by Trust Provider `authCacheKey` when the
  provider supplies one

Example:

- AWS IMDS and AWS Role identities are usually stable for the life of the
  client instance, so the cached auth session can normally be reused
- OIDC token sources may be request-scoped, so the OIDC Trust Provider supplies
  an `authCacheKey` derived from the resolved token to prevent reuse across
  different OIDC identities

### In-flight de-duplication

`EdgeClient` also de-duplicates concurrent work inside a single client
instance.

Current behavior:

- concurrent `/edge/v1/auth` requests with the same effective `resourceSet`,
  retry policy, and Trust Provider `authCacheKey` share one in-flight auth
  request
- concurrent Trust Provider identity collection can also share one in-flight
  collection, but only when the Trust Provider declares that its identity is
  stable for the lifetime of the client instance

Examples:

- AWS IMDS and AWS Role identity collection are stable per client instance, so
  concurrent calls can share the same in-flight identity collection
- OIDC with a static string token is also stable per client instance
- OIDC with a function token source is treated as request-scoped, so identity
  collection is not single-flighted across concurrent requests

### Credential caching

The SDK does not cache credentials returned by `/edge/v1/credentials`.

Current behavior:

- every `getCredential()` call sends a fresh `/edge/v1/credentials` request
- the SDK reuses the cached auth session when valid, but it does not cache the
  credential payload itself

This keeps credential handling simple and avoids making assumptions about
credential lifetime, rotation semantics, or credential format.

### Trust Provider identity caching

The SDK does not implement a general cache for Trust Provider identity
documents or tokens.

Current behavior:

- Trust Providers may collect identity during authentication and credential
  retrieval flows
- the SDK may reuse the resulting auth session, but it does not keep a generic
  reusable cache of:
  - IMDS instance identity documents
  - AWS STS signed identity payloads
  - OIDC identity tokens

One exception:

- a Trust Provider may supply `authCacheKey` metadata so the SDK can decide
  whether an existing auth session is safe to reuse
- for OIDC, this is currently a fingerprint of the resolved identity token
- the fingerprint is used only for auth-session reuse scoping; it is not a
  general identity cache

### Operational guidance

- Reusing one `EdgeClient` instance is appropriate for stable workload
  identities such as EC2 IMDS or Lambda execution-role identity.
- Request-scoped identity sources are safe only when the Trust Provider
  supplies cache metadata that scopes auth-session reuse correctly.
- If an application needs credential caching above `/edge/v1/credentials`, that
  should currently be implemented in the application layer rather than assumed
  from the SDK.

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

## HTTP Response Code Handling (Aembit Edge API v1)

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
        aws-metadata-service.ts
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
- OIDC and other Trust Provider implementations remain roadmap items
