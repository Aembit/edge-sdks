# Security Policy

Aembit takes the security of the Aembit Edge SDKs seriously. This document explains which SDK versions receive security updates, what falls within repository scope, how to privately report suspected vulnerabilities, and our coordinated disclosure guidelines.

For SDK usage and protocol details, see the [Aembit Edge API Guide](https://docs.aembit.io/dev-guide/api/edge/). This repository is licensed under the [Apache-2.0 License](./LICENSE).

## Supported Versions

Security patches are delivered **forward-only** on the latest release of the active `1.x` release line. Older minor or patch releases, pre-`1.0` releases, and unreleased SDKs are unsupported.

| Package / Component | Language & Runtime | Version Line | Security Support |
| :--- | :--- | :--- | :--- |
| [`@aembit/edge-sdk`](./ts) | TypeScript (`Node.js >= 20`) | `1.x` | Supported (forward-only patches on latest `1.x`) |
| [`aembit-edge-sdk`](./py) | Python (`Python >= 3.12`) | `1.x` | Supported (forward-only patches on latest `1.x`) |
| `@aembit/edge-sdk` / `aembit-edge-sdk` | TypeScript / Python | `< 1.0` | Unsupported |
| Go SDK (`go/`) | Go | Unreleased / Planned | Unsupported |

## Scope Boundaries

### In Scope

The following areas within `Aembit/edge-sdks` are in scope for repository security reports:

- Security vulnerabilities in the published `@aembit/edge-sdk` (npm) and `aembit-edge-sdk` (PyPI) packages, including:
  - Credential, bearer token, or secret exposure
  - Authentication, token-cache, or cache-invalidation bypass
  - Protocol, header, or server-side request forgery (SSRF) injection
  - Vulnerable runtime dependencies
- Leaked secrets or exploitable patterns in repository examples (`ts/examples/`, `py/examples/`) or GitHub Actions workflows (`.github/workflows/`).

### Out of Scope for Repository Advisories

Broader Aembit Cloud platform, control plane, or tenant vulnerabilities outside the `Aembit/edge-sdks` repository are out of scope for this repository's GitHub Security Advisories and must be reported exclusively to [security@aembit.io](mailto:security@aembit.io).

## Reporting a Vulnerability

**Do not report suspected security vulnerabilities through public GitHub issues, pull requests, or discussions.** Public disclosure before remediation puts users at risk.

### Private Reporting Channels

Please submit vulnerability reports privately through either of the following channels:

- **GitHub Private Vulnerability Reporting**: [Report a vulnerability on GitHub](https://github.com/Aembit/edge-sdks/security/advisories/new)
- **Email**: [security@aembit.io](mailto:security@aembit.io)

### What to Include

To help us triage and reproduce the issue quickly, please include sanitized diagnostic details:

- Affected package (`@aembit/edge-sdk` or `aembit-edge-sdk`) and exact version
- Runtime environment (`Node.js` or `Python` version and operating system)
- Trust Provider type (if applicable)
- Clear reproduction steps or a minimal, sanitized proof-of-concept
- Potential security impact assessment

## Coordinated Disclosure & Research Guidelines

### Coordinated Disclosure Process

We follow coordinated vulnerability disclosure practices:

- We provide prompt acknowledgment of receipt for vulnerability reports.
- We share status updates as we triage, validate, and remediate confirmed issues.
- Once a fix is ready, we publish a forward-fix release on the `1.x` line along with a GitHub Security Advisory.
- We mutually coordinate public disclosure timing with the reporter after users have had a reasonable window to upgrade.

### Good-Faith Research Boundaries

When researching or testing potential issues:

- Never test against Aembit tenants you do not own or lack explicit authorization to test.
- Never degrade service availability or perform denial-of-service testing.
- Never include real tenant URLs, live API tokens, client IDs, or secrets in vulnerability reports. Always sanitize logs and use safe placeholders such as `https://tenant.aembit.io`.

### Recognition & Bug Bounty Policy

- **Public Credit**: With your permission, Aembit welcomes giving public credit and attribution in published security advisories.
- **No Paid Bug Bounty**: Aembit does not operate a paid cash bug bounty program.
