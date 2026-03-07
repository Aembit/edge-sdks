# TypeScript SDK Agent Guide

Language-specific guidance for contributors and coding agents working in `ts/`.

This file augments the root `AGENTS.md`. Follow both files. If guidance conflicts, the root `AGENTS.md` takes precedence unless this file is stricter for TypeScript-specific behavior.

## Purpose

The TypeScript SDK is the reference implementation for this repository.

Changes in `ts/` should prioritize:

- clear and ergonomic developer APIs
- predictable authentication and token lifecycle behavior
- portability of concepts to future Python and Go SDKs

## Scope

This guide applies to files under `ts/`, including:

- SDK source code
- TypeScript tests
- TypeScript examples
- TypeScript documentation

## Directory Conventions

Keep TypeScript assets inside `ts/` and avoid cross-language coupling.

Recommended structure for TypeScript work:

- `ts/src/` for SDK implementation
- `ts/examples/` for runnable examples
- colocated tests using `*.test.ts` next to source files
- `ts/README.md` for TypeScript SDK usage docs

If the structure changes, keep naming and placement consistent within `ts/`.

## API Design Rules

TypeScript should expose a high-level client-first interface.

- Primary entry points should hide raw protocol details.
- Public methods should map to developer tasks such as authenticate and get credentials.
- Public configuration should use `Trust Provider` terminology (see root `AGENTS.md`).
- Keep advanced options optional and well-scoped.
- Preserve credential response data without forcing a rigid credential schema.

For credential payloads, prefer flexible representations such as `unknown` plus documented narrowing helpers, or `Record<string, unknown>` where appropriate.

## TypeScript Standards

- Prefer strict typing and avoid `any` in public API surfaces.
- Use `unknown` for untrusted external data and validate before use.
- Keep public types intentionally minimal and stable.
- Prefer named exports over default exports for SDK modules.
- Use `async` and `await` over promise chains for readability.

## Error Handling

Errors should be actionable and consistent.

- Normalize transport and API errors into SDK-defined error types.
- Include structured metadata when available, such as HTTP status and API error code.
- Preserve root causes with `cause` when wrapping errors.
- Avoid leaking raw low-level error shapes through public interfaces.

## Auth and Token Lifecycle

Authentication behavior should be predictable and safe under concurrency.

- Cache bearer tokens with clear expiration handling.
- Refresh tokens before hard expiry using a small safety window.
- Prevent duplicate concurrent refreshes for the same client instance.
- Handle auth failures explicitly and clear invalid cached state.

## HTTP and Runtime Behavior

- Build request construction in testable units.
- Keep HTTP concerns composable, including headers and base URL handling.
- Support runtime environments documented in `ts/README.md`.
- Do not embed tenant-specific URLs, secrets, or identifiers in code or examples.

## Testing Requirements

TypeScript SDK changes should include tests when behavior changes.

Testing stack and layout:

- use Vitest
- colocate tests as `*.test.ts` beside the corresponding source files

Focus tests on:

- request construction and serialization
- authentication flow behavior
- token caching and refresh logic
- error mapping and propagation
- credential retrieval behavior with varied payload shapes

Prefer deterministic tests with mocked network behavior and controlled time for token-expiry logic.

## Documentation and Examples

When public TypeScript SDK behavior changes:

- update `ts/README.md`
- update or add `ts/examples/` usage snippets
- keep examples runnable and minimal
- use placeholder values only

Examples are part of product quality, not optional extras.

## Dependency Policy

- Avoid adding dependencies unless they materially improve reliability, maintainability, or developer experience.
- Prefer small, well-maintained libraries over broad frameworks.
- Do not add dependencies for trivial utilities that can be implemented clearly in SDK code.

## Review Checklist for Agents

Before handing work back to the user:

- confirm behavior with relevant tests
- ensure API and README changes are aligned
- verify examples still reflect recommended usage
- verify no secrets or production identifiers are present
- present diffs and do not commit unless explicitly requested
