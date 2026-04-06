# Python SDK Agent Guide

Language-specific guidance for contributors and coding agents working in `py/`.

This file augments the root `AGENTS.md`. Follow both files. If guidance conflicts, the root `AGENTS.md` takes precedence unless this file is stricter for Python-specific behavior.

## Purpose

The Python SDK should follow the conceptual design established by the TypeScript SDK while feeling idiomatic for modern Python.

Changes in `py/` should prioritize:

- clear and ergonomic developer APIs
- predictable authentication and token lifecycle behavior
- portability of concepts from the TypeScript reference implementation
- compatibility with Python `>=3.10`

## Scope

This guide applies to files under `py/`, including:

- SDK source code
- Python tests
- Python examples
- Python documentation
- Python packaging and tooling configuration

## Directory Conventions

Keep Python assets inside `py/` and avoid cross-language coupling.

Recommended structure for Python work:

- `py/src/aembit_edge/` for SDK implementation
- `py/tests/` for tests
- `py/examples/` for runnable examples
- `py/README.md` for Python SDK usage docs
- `py/architecture.md` for Python SDK architecture notes

If the structure changes, keep naming and placement consistent within `py/`.

## API Design Rules

Python should expose a high-level client-first interface.

- Primary entry points should hide raw protocol details.
- Public methods should map to developer tasks such as `authenticate()` and `get_credential()`.
- Public APIs should use Python naming conventions such as `snake_case`.
- Public configuration should use `Trust Provider` terminology.
- Use official Aembit Edge API terminology from `https://docs.aembit.io/api-guide/edge/`; avoid alternate API names in docs/comments.
- Keep advanced options optional and well-scoped.
- Preserve credential response data without forcing a rigid credential schema.

Planned public entry points:

- `EdgeClient`
- `AsyncEdgeClient`

## Python Standards

- Support Python `>=3.10`.
- Use full type hints in public and internal code.
- Prefer `Protocol`, `TypedDict`, `dataclass`, and small focused classes where they improve clarity.
- Keep public types intentionally minimal and stable.
- Avoid unnecessary metaprogramming.
- Prefer standard-library features unless a dependency materially improves reliability or maintainability.
- Keep docstrings concise and focused on behavior-affecting details.

## Sync And Async Design

The SDK is expected to support both synchronous and asynchronous usage.

- Keep shared logic in reusable core modules where possible.
- Keep sync and async transport/client behavior aligned.
- Do not force async-only or sync-only design assumptions into shared types or architecture.
- When one path lands before the other, keep the code structure ready for parity.

## Error Handling

Errors should be actionable and consistent.

- Normalize transport and API errors into SDK-defined exception types.
- Include structured metadata when available, such as HTTP status and API error code.
- Preserve root causes with exception chaining.
- Avoid leaking raw low-level error shapes through public interfaces.

## Auth And Token Lifecycle

Authentication behavior should be predictable and safe under concurrency.

- Cache bearer tokens with clear expiration handling.
- Refresh tokens before hard expiry using a small safety window.
- Prevent duplicate concurrent refreshes for the same client instance.
- Handle auth failures explicitly and clear invalid cached state.

## Testing Requirements

Python SDK changes should include tests when behavior changes.

Testing and quality tools:

- use `pytest`
- use `ruff` for linting and formatting
- use `pyright` as the primary static type checker
- use `uv` for local environment and dependency management

Focus tests on:

- request construction and serialization
- authentication flow behavior
- token caching and refresh logic
- error mapping and propagation
- credential retrieval behavior with varied payload shapes

Prefer deterministic tests with mocked network behavior and controlled time for token-expiry logic.

## Documentation And Examples

When public Python SDK behavior changes:

- update `py/README.md`
- update or add `py/examples/` usage snippets
- keep examples runnable and minimal
- use placeholder values only

Examples are part of product quality, not optional extras.

## Dependency Policy

- Avoid adding dependencies unless they materially improve reliability, maintainability, or developer experience.
- Prefer small, well-maintained libraries over broad frameworks.
- Do not add dependencies for trivial utilities that can be implemented clearly in SDK code.
- When adding dependencies, consider Python `>=3.10` compatibility and static typing support.

## Review Checklist For Agents

Before handing work back to the user:

- run `uv run ruff check .` for Python file changes and confirm it passes
- run `uv run ruff format --check .`
- run `uv run pyright`
- run `uv run pytest`
- ensure API and README changes are aligned
- verify examples still reflect recommended usage
- verify no secrets or production identifiers are present
- present diffs and do not commit unless explicitly requested
