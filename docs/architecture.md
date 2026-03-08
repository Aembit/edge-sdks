# Edge SDK Architecture (Cross-Language)

This document defines architecture decisions that should be consistent across SDKs in this repository.

It is language-agnostic. Language-specific implementation details belong in each language directory (for example `ts/architecture.md`).

## Goals

- Provide a high-level SDK that hides protocol details of the Edge API.
- Keep a consistent conceptual model across languages.
- Support environment-specific workload identity via Trust Providers.
- Keep public APIs simple while preserving flexibility for credential payloads.

## Non-Goals

- Exposing raw HTTP endpoint wrappers as the primary public API.
- Forcing a single strict credential schema for all providers.
- Standardizing internal module names across languages.

## Sources of Truth

- Protocol contract: pinned OpenAPI snapshots in `spec/openapi/`.
- Architectural contract: this document.
- Language realization: language-specific architecture documents.

## API Version Target

This architecture targets **Aembit Edge API v1**.

Current protocol reference:

- `spec/openapi/api-1.yaml`
- snapshot retrieval timestamp: `2026-03-07T17:37:55Z` (from `spec/openapi/README.md`)

## Layered Architecture

All SDKs should follow a three-layer model.

### 1) API Transport and Protocol Layer

Responsibilities:

- HTTP transport and request execution
- API request/response type definitions
- Low-level endpoint adapters for `/edge/v1/auth` and `/edge/v1/credentials`
- Retry policy application and timeout handling
- Normalized SDK error mapping

Boundary:

- This layer implements API protocol and wire-format handling.
- This layer should not contain environment-specific identity retrieval logic.

### 2) Trust Provider Layer

Responsibilities:

- Collect environment-specific identity tokens or identity documents (for example Kubernetes service account tokens or AWS metadata identity documents)
- Build identity payload data required for authentication
- Encapsulate runtime mechanics (metadata services, token sources, platform APIs)

Boundary:

- Trust Provider mechanics stay internal.
- Developers select a Trust Provider; they do not manage provider internals.

### 3) Developer Client Layer

Responsibilities:

- Expose ergonomic public API methods (for example `authenticate()`, `getCredential()`)
- Orchestrate Trust Provider + API Transport and Protocol interactions
- Manage token lifecycle and automatic authentication behavior

Boundary:

- Public API should not expose raw endpoint methods or protocol-level transport objects.

## Public API Contract

SDK public API contract:

- constructor/config with:
  - base URL
  - client ID
  - Trust Provider selection
  - optional Resource Set
  - optional retry and timeout configuration
- `authenticate()` for explicit authentication
- `getCredential()` for credential retrieval

Behavioral requirements:

- `getCredential()` must auto-authenticate when no valid token exists.
- `authenticate()` should not expose raw bearer tokens in public return values.

## Token Lifecycle Semantics

SDKs should implement:

- in-memory token caching
- expiry-aware token validity checks
- default expiry skew window of `60s` to avoid edge-of-expiry failures
- configurable expiry skew override for callers
- single-flight authentication/refresh per client instance to avoid duplicate concurrent calls

## Retry And Timeout Semantics

SDKs should:

- enable retry defaults by default
- allow developer overrides for retry settings
- apply retries only to transient failures (network, throttling, and selected server errors)
- use bounded backoff (with jitter recommended)

## Endpoint Response Code Semantics (Edge API v1)

As of `spec/openapi/api-1.yaml` (retrieved `2026-03-07T17:37:55Z`), expected HTTP response codes are:

- `POST /edge/v1/auth`: `200`, `400`, `401`, `500`
- `POST /edge/v1/credentials`: `200`, `400`, `500`

Default handling for other status codes:

- unlisted `4xx`: map to normalized API/client errors and do not retry by default
- unlisted `5xx`: map to normalized API/server errors and allow retry policy to apply

## Error Semantics

SDKs should expose normalized SDK error types with structured metadata when available:

- HTTP status
- API error code/message
- underlying cause (where supported by language/runtime)

## Credential Data Model

Credential responses must remain flexible.

- Do not assume one credential format.
- Preserve payload data returned by the API.
- Expose typed wrappers conservatively so SDKs do not discard provider-specific fields.

## Mapping To OpenAPI Terminology

SDK docs and APIs should use `Trust Provider` as the canonical term.

The OpenAPI schema may still use `attestation` wording in descriptions. SDK implementations should treat those descriptions as protocol context, not public API naming guidance.

## Testing Expectations

Language SDK tests should cover:

- request construction and endpoint behavior
- authentication and token lifecycle
- retry behavior
- error mapping and propagation
- credential retrieval with varied payload formats
