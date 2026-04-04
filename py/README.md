# Aembit Edge Python SDK

Python SDK for interacting with the Aembit Edge API.

This SDK should follow the conceptual design established by the TypeScript SDK while providing idiomatic Python APIs for backend services, serverless functions, web applications, and MCP servers.

## Status

The Python SDK is in early public API setup.

Current scope in this directory:

- package and tooling setup
- Python-specific documentation and architecture notes
- public sync client API skeleton and shared model types

Functional SDK behavior will be added incrementally in follow-up changes.

## Runtime And Packaging

- Python target: `>=3.10`
- package distribution name: `aembit-edge-sdk`
- import package: `aembit_edge`
- build backend: `hatchling`

## Planned v1 Scope

Planned v1 behavior:

- high-level sync and async clients for authentication and credential retrieval
- automatic token lifecycle management
- retry logic for transient failures
- built-in Trust Provider coverage starting with AWS Role, followed by AWS Metadata Service (IMDS)

## Client API

The package now exposes the initial public sync API surface:

```python
from aembit_edge import EdgeClient, EdgeClientConfig
from aembit_edge import CredentialResult, CredentialServerRef, GetCredentialInput
```

Current public concepts:

- `authenticate()`
- `get_credential()`
- `client_id`
- `resource_set`
- `Trust Provider`

Current limitation:

- `EdgeClient` is intentionally stubbed and raises `NotImplementedError`
- async client support is still planned but not yet exposed

## Documentation

- implementation and agent guidance: `py/AGENTS.md`
- Python architecture design: `py/architecture.md`
- cross-language contracts and API snapshots: `spec/` and `spec/openapi/`
- cross-language architecture: `docs/architecture.md`
- official Aembit Edge API docs: <https://docs.aembit.io/api-guide/edge/>

## Local Development

Run from `py/`:

- `uv sync --extra dev --locked`
- `uv run ruff check .`
- `uv run ruff format --check .`
- `uv run mypy`
- `uv run pytest`

Auto-format locally when needed:

- `uv run ruff format .`
- `uv run ruff check . --fix`

## Planned Layout

Expected Python SDK structure:

- `py/src/aembit_edge/` SDK source code
- `py/tests/` tests
- `py/examples/` runnable examples

## Testing

Planned testing and quality stack:

- test runner: `pytest`
- linter and formatter: `ruff`
- static type checking: `mypy`
- environment and dependency management: `uv`

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
