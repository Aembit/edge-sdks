# AGENTS.md

Guidelines for coding agents and contributors working in the **Aembit Edge SDKs** repository.

This repository hosts SDKs and examples for interacting with the **Aembit Edge API**. The goal is to provide developer-friendly libraries that simplify workload authentication and credential retrieval.

Coding agents are expected to follow these rules when modifying this repository.

## Repository Purpose

This repository contains **multi-language SDKs** for the Aembit Edge API.

These SDKs help applications:

- authenticate workloads using environment-specific Trust Provider signals  
- obtain an Edge bearer token  
- retrieve credentials for protected services

The SDKs provide higher-level developer abstractions on top of the HTTP API.

The first implementation in this repository is the **TypeScript SDK**, which serves as the reference design for future SDKs.

Terminology:

- Use `Trust Provider` as the canonical term in SDK docs and APIs.
- OpenAPI schema descriptions may still use `attestation` wording.
- Use official Aembit wording from `https://docs.aembit.io/api-guide/edge/`; do not introduce alternate platform terms unless explicitly requested.

Planned SDKs include:

- TypeScript  
- Python  
- Go

## Reference Implementation

The **TypeScript SDK** is the reference implementation for this
repository.

When implementing SDKs in other languages, agents should follow the
conceptual design and behavior established by the TypeScript SDK unless
there is a clear language-specific reason to do otherwise.

## Repository Structure

Repository layout:

- `/` repository-level governance and overview docs (`README.md`, `AGENTS.md`)
- `docs/` architecture and design documentation
- `spec/` cross-language SDK contracts
- `spec/openapi/` pinned OpenAPI snapshots and snapshot metadata
- `ts/` TypeScript SDK (reference implementation)
- `py/` Python SDK
- `go/` planned Go SDK directory

Rules:

- Language-specific code must remain within its language directory.  
- Cross-language design documents belong in `spec/`.  
- Pinned OpenAPI snapshots belong in `spec/openapi/`.  
- OpenAPI metadata and provenance belong in `spec/openapi/README.md`.  
- Architecture and design explanations belong in `docs/`.  
- Examples should live inside the language directory they belong to.

Do not introduce cross-language abstractions unless explicitly requested.

## Coding Agent Workflow Rules

Coding agents must follow these workflow rules:

### Propose first, then implement

Agents must not make file updates before checking with the user.

Instead:

1. Share a concise proposal or plan for the intended changes.  
2. Ask clarifying questions if requirements are ambiguous or incomplete.  
3. Wait for explicit user approval.  
4. Implement only after approval.

### Do not commit automatically

Agents must **never commit changes automatically**.

Instead:

1. Implement changes.  
2. Present the diff or modified files.  
3. Ask the user to confirm before committing.

### Prefer small, focused changes

Agents should:

- implement minimal working improvements  
- avoid large refactors unless explicitly requested  
- make changes easy to review

### Keep documentation aligned with code

When public APIs change:

- update the relevant README  
- update examples if necessary

### Avoid unnecessary dependencies

Agents should avoid adding new dependencies unless they clearly improve:

- reliability  
- maintainability  
- developer experience

## Design Principles

All SDKs in this repository should follow these principles.

### Developer ergonomics

The default usage path must be simple.

Most applications should only need to configure:

- Aembit Edge API base URL  
- Edge SDK Client ID (from Trust Provider configuration)  
- a Trust Provider

Advanced configuration should remain optional.

Clarification:

- `Edge SDK Client ID` is an auto-generated value tied to Trust Provider setup.
- It is not the same as `Client Identifier` from client workload configuration.
- Access policy configuration (client workload, server workload, Trust Provider, credential provider) is managed in Aembit and must already exist for SDK requests to match.

### Consistent conceptual model across languages

SDKs should share consistent concepts:

- client configuration  
- authentication flow  
- token lifecycle  
- error semantics

Language implementations may differ internally, but should expose similar behavior.

### High-level client API

SDKs should expose a **high-level client** that:

- performs authentication automatically  
- manages bearer token lifecycle  
- retrieves credentials  
- provides clear error handling

The high-level client should hide unnecessary protocol complexity.

### Do not assume a fixed credential format

Aembit Edge API may return different credential types depending on the
credential provider configured for the target service.

Examples may include:

- API keys
- passwords
- OAuth tokens
- JWTs
- X.509 certificates

SDK implementations must avoid assuming a single credential structure.

Credential responses should be represented in a way that preserves the
data returned by the API without forcing a rigid type model that only
supports one credential format.

## Examples Are Part of the Product

Examples are considered part of the SDK.

Each language SDK should include:

- at least one **minimal runnable example**  
- examples demonstrating common runtime environments

Examples should:

- be small  
- be easy to run  
- demonstrate recommended usage patterns

## Testing Expectations

SDK changes should include tests where appropriate.

Testing should cover:

- request construction  
- authentication flow  
- token lifecycle behavior  
- error handling

Integration tests may be added later.

Linting expectations:

- For TypeScript changes, run `npm run lint`, `npm run typecheck`, and `npm test` from `ts/`.
- For Python changes, run `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright`, and `uv run pytest` from `py/`.
- For Markdown/documentation changes, run `npm run lint:md` from the repository root.

## Documentation Locations

Use the following locations for documentation and examples.

Some language-specific paths are created when that SDK is added.

| Location | Purpose |
| :---- | :---- |
| `README.md` | high-level repository overview |
| `docs/` | architecture and design explanations |
| `docs/README.md` | docs index and writing conventions |
| `spec/` | cross-language SDK design contracts |
| `spec/openapi/` | pinned OpenAPI snapshot files used for SDK development |
| `spec/openapi/README.md` | OpenAPI snapshot metadata (source URL, retrieval date, version) |
| `ts/README.md` | TypeScript SDK documentation |
| `ts/examples/` | runnable TypeScript SDK usage examples |
| `py/examples/` | runnable Python SDK usage examples |
| `go/examples/` | runnable Go SDK usage examples |

Agents should not duplicate documentation across multiple locations.

## Language-Specific Instructions

Language-specific development rules are defined in language directories:

- `ts/AGENTS.md` (current)
- `py/AGENTS.md`
- `go/AGENTS.md` (add when Go SDK work begins)

Coding agents working in a language directory must follow both:

- this root `AGENTS.md`  
- the language-specific `AGENTS.md`

## Security Considerations

Agents must never:

- commit credentials  
- commit tokens  
- embed tenant URLs or secrets in examples  
- include real production identifiers in sample code

Examples must always use placeholder values.

## Open Source Readiness

This repository is intended to become open source.

Agents should assume that:

- all code will eventually be public  
- documentation should be understandable outside Aembit  
- internal-only references should be avoided
