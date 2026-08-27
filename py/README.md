# Aembit Edge Python SDK

[![PyPI version](https://img.shields.io/pypi/v/aembit-edge-sdk.svg)](https://pypi.org/project/aembit-edge-sdk/)
[![Python](https://img.shields.io/pypi/pyversions/aembit-edge-sdk.svg)](https://pypi.org/project/aembit-edge-sdk/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/Aembit/edge-sdks/blob/main/LICENSE)

Official Python SDK for interacting with the [Aembit Edge API](https://docs.aembit.io/api-guide/edge/).

The Aembit Edge SDK allows Python backend services, serverless functions, web applications, AI agents, and MCP servers to authenticate and retrieve credentials dynamically without managing static secrets.

## Features

- 🔐 **Zero Hardcoded Secrets**: Authenticate via workload identity (AWS STS Role, GitHub Actions OIDC, GitLab CI/CD OIDC, Terraform Cloud OIDC).
- 🔄 **Automatic Token Lifecycle**: Built-in in-memory bearer token caching and proactive background refresh.
- 🪵 **Standard Library Logging**: Configured via the standard `logging` library under the `aembit_edge` namespace.
- 📦 **Modern Python**: Strictly typed, supporting Python `>=3.10`.

## Installation

```bash
pip install aembit-edge-sdk
```

Or using `uv`:

```bash
uv add aembit-edge-sdk
```

## Quickstart

### Using AWS IAM Role (STS)

```python
from aembit_edge import CredentialServerRef, EdgeClient, EdgeClientConfig, GetCredentialInput
from aembit_edge.trust_providers import AwsRoleTrustProvider

# 1. Initialize the AWS Role Trust Provider
aws_provider = AwsRoleTrustProvider(region="us-east-1")

# 2. Configure the Edge Client
config = EdgeClientConfig(
    base_url="https://your-tenant.aembit.io",
    client_id="your-client-id",
    trust_provider=aws_provider,
)
client = EdgeClient(config)

# 3. Retrieve target server credentials
server = CredentialServerRef(host="database.internal", port=5432)
request = GetCredentialInput(server=server, credential_type="api_key")

result = client.get_credential(request)
print("Retrieved Credential Data:", result.data)
```

### Using OIDC Trust Providers (GitHub, GitLab, Terraform)

```python
from aembit_edge import CredentialServerRef, EdgeClient, EdgeClientConfig, GetCredentialInput
from aembit_edge.trust_providers import GitHubTrustProvider

# 1. Initialize the trust provider with the environment's identity token
github_provider = GitHubTrustProvider(identity_token="YOUR_GITHUB_OIDC_TOKEN")

# 2. Configure the Edge Client
config = EdgeClientConfig(
    base_url="https://your-tenant.aembit.io",
    client_id="your-client-id",
    trust_provider=github_provider,
)
client = EdgeClient(config)

# 3. Request credentials for a target server
server = CredentialServerRef(host="api.internal", port=443)
request = GetCredentialInput(server=server, credential_type="api_key")

result = client.get_credential(request)
print("Retrieved Credential Data:", result.data)
```

Other OIDC providers (`GitLabTrustProvider`, `TerraformTrustProvider`) follow the same pattern:

```python
from aembit_edge.trust_providers import GitLabTrustProvider, TerraformTrustProvider

# For GitLab CI/CD:
gitlab_provider = GitLabTrustProvider(identity_token="YOUR_GITLAB_OIDC_TOKEN")

# For Terraform Cloud:
terraform_provider = TerraformTrustProvider(identity_token="YOUR_TERRAFORM_OIDC_TOKEN")
```

## Supported Trust Providers

| Trust Provider | Class Name | Import Path |
| :--- | :--- | :--- |
| **AWS IAM Role (STS)** | `AwsRoleTrustProvider(region=...)` | `aembit_edge.trust_providers` |
| **GitHub Actions OIDC** | `GitHubTrustProvider(identity_token=...)` | `aembit_edge.trust_providers` |
| **GitLab CI/CD OIDC** | `GitLabTrustProvider(identity_token=...)` | `aembit_edge.trust_providers` |
| **Terraform Cloud OIDC** | `TerraformTrustProvider(identity_token=...)` | `aembit_edge.trust_providers` |

## Logging & Observability

By default, the SDK remains silent with a `logging.NullHandler` attached to the `aembit_edge` namespace. To enable operational debug logging:

```python
import logging

logging.basicConfig(level=logging.INFO)
logging.getLogger("aembit_edge").setLevel(logging.DEBUG)
```

## Examples

Runnable integration examples are available in the GitHub repository:

- [Logging Integration (Loguru & Structlog)](https://github.com/Aembit/edge-sdks/tree/main/py/examples/logging_integration)

## Documentation & Resources

- [Official Aembit Edge API Guide](https://docs.aembit.io/api-guide/edge/)
- [Aembit Documentation](https://docs.aembit.io/)
- [GitHub Issue Tracker](https://github.com/Aembit/edge-sdks/issues)
- [Contributing Guide](https://github.com/Aembit/edge-sdks/blob/main/CONTRIBUTING.md)

## License

This project is licensed under the [Apache-2.0 License](https://github.com/Aembit/edge-sdks/blob/main/LICENSE).
