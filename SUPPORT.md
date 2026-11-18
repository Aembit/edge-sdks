# Support Policy

This document defines the support scope, version lifecycle, and support channels for the **Aembit Edge SDKs** repository, including published SDK packages, Trust Provider integrations, and runnable examples for the [Aembit Edge API](https://docs.aembit.io/dev-guide/api/edge/).

## Support Scope

| Component | Location / Package | Support Level | Notes |
| :--- | :--- | :--- | :--- |
| **TypeScript SDK** | [`@aembit/edge-sdk`](https://www.npmjs.com/package/@aembit/edge-sdk) (`ts/src/`) | **Officially Supported (SLA)** | Documented public APIs on the active `1.x` release line running on `Node.js >= 20`. |
| **Python SDK** | [`aembit-edge-sdk`](https://pypi.org/project/aembit-edge-sdk/) (`py/src/aembit_edge/`) | **Officially Supported (SLA)** | Documented public APIs on the active `1.x` release line running on `Python >= 3.12`. |
| **Runnable Examples** | `ts/examples/`, `py/examples/` | **Reference / As-Is** | Provided "as-is" under the [Apache-2.0 License](./LICENSE) as reference implementations, maintained on a best-effort basis, and excluded from commercial production SLAs. |
| **Internal Modules & Tooling** | `ts/src/internal/`, `aembit_edge.internal`, repository build/lint scripts | **Out of Scope** | Private or unexported `internal` modules and repository automation are not part of the public API contract and may change without notice. |
| **Unreleased Language SDKs** | `go/` | **Out of Scope** | Unreleased or planned language SDKs are not yet supported. |

## Version and Runtime Lifecycle

- **Active Release Line**: Official support applies to the active `1.x` release line for `@aembit/edge-sdk` and `aembit-edge-sdk` on their documented runtime baselines (`Node.js >= 20` and `Python >= 3.12`).
- **Forward Fixes**: Bug fixes and security patches ship forward on the `1.x` release line rather than being backported to older minor or patch versions.
- **Upgrade Before Reporting**: Please upgrade to the latest `1.x` minor or patch release and verify that the issue persists before opening a support request.

## How to Get Help

### Commercial Customer Support (SLA)

Active Aembit customers seeking SLA-backed assistance for `@aembit/edge-sdk` or `aembit-edge-sdk` can reach Aembit Support through the following channels:

- **Support Portal**: Submit a ticket via the [Aembit Support Portal](https://support.aembit.io/hc/en-us/requests/new).
- **Email**: Contact [support@aembit.io](mailto:support@aembit.io).
- **Self-Service Documentation**: Browse the [Aembit Knowledge Base](https://support.aembit.io/) and the [Aembit Edge API Guide](https://docs.aembit.io/dev-guide/api/edge/).

When contacting support, include the SDK package name and version, runtime version (`Node.js` or `Python`), active Trust Provider type, and sanitized reproduction details or error messages.

### Community, Bug Reports, and Examples

Open-source users, feature requests, reproducible SDK defects, and questions or improvements for `ts/examples/` and `py/examples/` should use [GitHub Issues](https://github.com/Aembit/edge-sdks/issues).

**Do not include sensitive data in public issues**: Never post real tenant URLs, live tokens, client identifiers, or secrets in public GitHub issues. Always sanitize logs and use placeholder values (for example, `https://tenant.aembit.io`).

## Security Vulnerabilities

Do **not** report security vulnerabilities through public GitHub issues or standard support tickets.

Please report suspected security vulnerabilities privately through either of these channels:

- **Email**: Send details to [security@aembit.io](mailto:security@aembit.io).
- **GitHub Security Advisories**: Submit a private report via the repository's [GitHub Security tab](https://github.com/Aembit/edge-sdks/security).
