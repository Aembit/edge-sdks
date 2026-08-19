# Aembit Edge Python SDK

Python SDK for interacting with the Aembit Edge API.

This SDK should follow the conceptual design established by the TypeScript SDK while providing idiomatic Python APIs for backend services, serverless functions, web applications, and MCP servers.

## Status

The Python SDK is in early implementation.

Current scope in this directory:

- package and tooling setup
- Python-specific documentation and architecture notes
- working sync `EdgeClient` authentication and credential retrieval
- shared protocol, retry, token lifecycle, and error-mapping internals

Async client support and built-in Trust Provider implementations will be added incrementally.

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
from aembit_edge import AsyncTrustProvider, TrustProvider
```

Current public concepts:

- `authenticate()`
- `get_credential()`
- `client_id`
- `resource_set`
- `Trust Provider`

Current built-in Trust Provider surface (imported from `aembit_edge.trust_providers`):

- `AwsRoleTrustProvider(region=...)` - AWS Role Trust Provider using the botocore credential chain and SigV4 signing for STS `GetCallerIdentity` request generation.
- `GitHubTrustProvider(identity_token=...)` - GitHub Action Trust Provider using OIDC identity tokens.
- `GitLabTrustProvider(identity_token=...)` - GitLab Job Trust Provider using OIDC identity tokens.
- `TerraformTrustProvider(identity_token=...)` - Terraform Cloud Trust Provider using OIDC identity tokens.

## Example Usage

### Using OIDC Trust Providers (GitHub, GitLab, Terraform)

To authenticate a workload using an OIDC-based trust provider, retrieve the OIDC identity token from your environment and construct the appropriate provider:

```python
from aembit_edge import EdgeClient, EdgeClientConfig, GetCredentialInput, CredentialServerRef
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
server = CredentialServerRef(host="database.internal", port=5432)
request = GetCredentialInput(server=server, credential_type="api_key")

result = client.get_credential(request)
print("Retrieved Credential Data:", result.data)
```

Other OIDC trust providers (`GitLabTrustProvider`, `TerraformTrustProvider`) follow the same pattern:

```python
from aembit_edge.trust_providers import GitLabTrustProvider, TerraformTrustProvider

# For GitLab CI/CD:
gitlab_provider = GitLabTrustProvider(identity_token="YOUR_GITLAB_OIDC_TOKEN")

# For Terraform Cloud:
terraform_provider = TerraformTrustProvider(identity_token="YOUR_TERRAFORM_OIDC_TOKEN")
```

### Using AWS Role Trust Provider

For workloads running on AWS:

```python
from aembit_edge import EdgeClient, EdgeClientConfig, GetCredentialInput, CredentialServerRef
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
server = CredentialServerRef(host="api.internal", port=443)
request = GetCredentialInput(server=server, credential_type="api_key")

result = client.get_credential(request)
print("Credential Data:", result.data)
```

## Current Limitations

- `EdgeClient` is implemented for synchronous authentication and credential retrieval.
- Async client support is still planned but not yet exposed.

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
- `uv run pyright`
- `uv run pytest`
- `uv build --wheel --sdist` for packaging or build configuration changes

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
- static type checking: `pyright`
- environment and dependency management: `uv`

## Security

Do not include real tenant URLs, tokens, or secrets in examples or tests.
