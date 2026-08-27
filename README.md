# Aembit Edge SDKs

Official multi-language SDKs and examples for integrating applications, serverless functions, AI agents, and services with the [Aembit Edge API](https://docs.aembit.io/api-guide/edge/).

The Aembit Edge SDKs make it easy for developers to authenticate workloads and retrieve credentials dynamically through Aembit without managing static secrets or interacting directly with low-level HTTP protocols.

## Why Aembit Edge SDKs?

- 🔐 **Workload Identity Native**: Authenticate workloads using native cloud metadata (AWS IMDSv2, GCP Identity Tokens) or federated OIDC (GitHub Actions, GitLab CI/CD, Terraform Cloud, Kubernetes).
- 🚫 **Zero Secret Storage**: Eliminate long-lived credentials, static tokens, and secret sprawl in application code, configuration files, and environments.
- 🔄 **Automatic Lifecycle Management**: Automatic in-memory token caching, refresh window evaluation, and transient error resilience.
- ⚡ **Lightweight & Modular**: High-performance, minimal dependencies, and tree-shakeable subpath imports designed for modern serverless and edge runtimes.

## Available SDKs

| Language | Package | Status | Package Registry | Source Code |
| :--- | :--- | :--- | :--- | :--- |
| **TypeScript / Node.js** | `@aembit/edge-sdk` | [![npm version](https://img.shields.io/npm/v/@aembit/edge-sdk.svg)](https://www.npmjs.com/package/@aembit/edge-sdk) | [npm](https://www.npmjs.com/package/@aembit/edge-sdk) | [`ts/`](./ts) |
| **Python** | `aembit-edge-sdk` | [![PyPI version](https://img.shields.io/pypi/v/aembit-edge-sdk.svg)](https://pypi.org/project/aembit-edge-sdk/) | [PyPI](https://pypi.org/project/aembit-edge-sdk/) | [`py/`](./py) |
| **Go** | `github.com/Aembit/edge-sdks/go` | Planned | — | `go/` |

## Repository Organization

This repository is organized as a multi-language SDK monorepo:

- [`ts/`](./ts): Official TypeScript SDK reference implementation and runnable examples.
- [`py/`](./py): Official Python SDK implementation and runnable examples.
- [`docs/`](./docs): High-level SDK design and architectural documentation.
- [`spec/`](./spec): Cross-language contracts and pinned OpenAPI specifications.

## Documentation & Resources

- [Official Aembit Edge API Guide](https://docs.aembit.io/api-guide/edge/)
- [Aembit Documentation](https://docs.aembit.io/)
- [GitHub Issue Tracker](https://github.com/Aembit/edge-sdks/issues)
- [Contributing Guidelines](./CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please review our [Contributing Guide](./CONTRIBUTING.md) for branch naming standards, local development checks, and pull request workflows.

## License

This project is licensed under the [Apache-2.0 License](./LICENSE).
