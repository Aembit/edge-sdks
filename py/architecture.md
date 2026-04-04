# Python SDK Architecture

This document describes how the Python SDK should realize the cross-language architecture contract in `docs/architecture.md`.

## Scope

This is the initial architecture for Python SDK v1 work.

Initial baseline:

- runtime target: Python `>=3.10`
- package distribution name: `aembit-edge-sdk`
- import package: `aembit_edge`
- target API contract: Aembit Edge API v1 (`spec/openapi/api-1.yaml`)
- canonical API docs: `https://docs.aembit.io/api-guide/edge/`
- OpenAPI snapshot timestamp: `2026-03-07T17:37:55Z`
- initial Trust Provider priority: AWS Role first, AWS Metadata Service next
- test framework: `pytest`
- lint and format: `ruff`
- static type checking: `mypy`
- local workflow: `uv`

## Design Goals

- Match the TypeScript SDK's public concepts and behavioral guarantees where practical.
- Feel natural for Python developers using backend frameworks and serverless runtimes.
- Support both synchronous and asynchronous client APIs.
- Keep public APIs high-level and focused on authentication and credential retrieval.

## Layer Implementation Plan

The Python SDK should follow the same three-layer architecture used across the repository.

### 1) API Transport And Protocol Layer

Purpose: HTTP execution and Aembit Edge API protocol handling.

Planned responsibilities:

- HTTP request execution
- timeout handling
- retry policy application
- protocol-aligned request/response models
- normalized SDK error mapping

Design note:

- This layer should be structured so sync and async transports can share request/response and retry logic where practical.

### 2) Trust Provider Layer

Purpose: environment-specific identity retrieval.

Planned responsibilities:

- collect runtime-specific workload identity
- build identity payloads required by `/edge/v1/auth`
- encapsulate platform mechanics such as metadata calls and signed request generation

Initial Trust Provider order:

1. AWS Role
2. AWS Metadata Service (IMDS)

### 3) Developer Client Layer

Purpose: ergonomic public API methods.

Planned responsibilities:

- expose `EdgeClient` and `AsyncEdgeClient`
- orchestrate Trust Provider and protocol interactions
- manage token lifecycle and automatic authentication behavior

Boundary:

- Public APIs should not expose raw endpoint wrappers as the primary interface.

## Public API Direction

Planned public API shape:

- configuration with:
  - `base_url`
  - `client_id`
  - `trust_provider`
  - optional `resource_set`
  - optional retry and timeout configuration
- `authenticate()`
- `get_credential()`

The public API should use Python conventions such as `snake_case` while preserving the same conceptual model as the TypeScript SDK.

## Sync And Async Strategy

The SDK should support both sync and async clients.

Target design:

- shared core logic for configuration, protocol models, retry policy, token lifecycle, and error normalization
- sync client and transport for conventional scripts and blocking serverless integrations
- async client and transport for ASGI apps, async MCP servers, and other event-loop-based runtimes

Implementation note:

- The codebase should be organized to avoid duplicating business logic across sync and async paths.
- Public parity matters more than sharing every internal implementation detail.

## Packaging Layout

The current scaffold uses a `src/` layout.

Planned top-level package shape:

- `aembit_edge/`
- `aembit_edge/trust_providers/`
- `aembit_edge/internal/`

The internal module layout may evolve as implementation work starts, but public imports should remain intentionally small.

## Status

This document defines the initial implementation direction only. Working client code and Trust Provider implementations will be added in subsequent changes.
