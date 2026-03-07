# AGENTS.md

Guidelines for coding agents and contributors working in the **Aembit Edge SDKs** repository.

This repository hosts SDKs and examples for interacting with the **Aembit Edge API**. The goal is to provide developer-friendly libraries that simplify workload authentication and credential retrieval.

Coding agents are expected to follow these rules when modifying this repository.

## Repository Purpose

This repository contains **multi-language SDKs** for the Aembit Edge API.

These SDKs help applications:

- authenticate workloads using environment-specific attestation  
- obtain an Edge bearer token  
- retrieve credentials for protected services

The SDKs provide higher-level developer abstractions on top of the HTTP API.

The first implementation in this repository is the **TypeScript SDK**, which serves as the reference design for future SDKs.

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

TODO: add `tree` output here.

Rules:

- Language-specific code must remain within its language directory.  
- Cross-language design documents belong in `spec/`.  
- Architecture and design explanations belong in `docs/`.  
- Examples should live inside the language directory they belong to.

Do not introduce cross-language abstractions unless explicitly requested.

## Coding Agent Workflow Rules

Coding agents must follow these workflow rules:

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

- Edge API base URL  
- client ID  
- an attestation provider

Advanced configuration should remain optional.

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

The Edge API may return different credential types depending on the
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

## Documentation Locations

Use the following locations for documentation.

| Location | Purpose |
| :---- | :---- |
| `README.md` | high-level repository overview |
| `docs/` | architecture and design explanations |
| `spec/` | cross-language SDK design contracts |
| `ts/README.md` | TypeScript SDK documentation |
| `examples/` | runnable usage examples |

Agents should not duplicate documentation across multiple locations.

## Language-Specific Instructions

Language-specific development rules are defined in:

ts/AGENTS.md py/AGENTS.md go/AGENTS.md

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
