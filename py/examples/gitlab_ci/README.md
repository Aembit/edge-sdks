# GitLab CI/CD OIDC Example (Python)

Runnable GitLab CI/CD example for the Python SDK using GitLab OIDC.

This example demonstrates how to configure and run the Python SDK inside a GitLab CI/CD job:

- edit a small config block in [`./main.py`](./main.py)
- configure your `.gitlab-ci.yml` file to request an OIDC Job ID token
- run the example using `uv` inside your GitLab runner

## Prerequisites

- A GitLab repository hosting your pipelines
- A `.gitlab-ci.yml` pipeline file configured with the required `id_tokens` block:
  ```yaml
  id_tokens:
    GITLAB_OIDC_TOKEN:
      aud: https://<tenant-id>.id.aembit.io
  ```
- Python `>=3.10`
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your GitLab Project or Job (e.g. matching `gitlab_project_path` claim `your-group/your-project`)
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- a GitLab Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- GitLab Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/gitlab-trust-provider/>
- GitLab OIDC auth setup: <https://docs.aembit.io/api-guide/edge/auth/gitlab-job-id-token>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL (e.g. `https://<tenant>.ec.<stack>.aembit.io`)
- `client_id`: your Edge SDK Client ID from the GitLab Trust Provider
- `gitlab_token_env_var`: the environment variable name configured in your `.gitlab-ci.yml` (defaults to `GITLAB_OIDC_TOKEN`)
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Deploy and Run the Example

### 1. In a GitLab CI/CD Pipeline
Ensure your job contains the `id_tokens` configuration block. The GitLab runner will dynamically fetch and inject the JWT as an environment variable (`GITLAB_OIDC_TOKEN`), which the SDK automatically reads from the environment.

Create or update your `.gitlab-ci.yml` file:

```yaml
stages:
  - test

run-aembit-sdk:
  stage: test
  image: python:3.11-slim
  id_tokens:
    GITLAB_OIDC_TOKEN:
      aud: https://<tenant>.id.<stack>.aembit.io  # Your tenant Identity URL
  variables:
    PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"
  cache:
    paths:
      - .cache/pip
  before_script:
    # Install uv locally
    - pip install uv
  script:
    - uv run py/examples/gitlab_ci/main.py
```

### 2. Locally (For Development / Mock Testing)
To test the script locally without running a live GitLab runner, fetch or construct a test JWT token, export it to your shell, and run:

```bash
# On Linux/macOS
export GITLAB_OIDC_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# On Windows (PowerShell)
$env:GITLAB_OIDC_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Execute locally
uv run py/examples/gitlab_ci/main.py
```

## Output

The script prints the progress and a safe authenticated session summary.

Example successful output:

```text
Retrieving credentials for target.example.com:443 using GitLab Trust Provider...
Credential retrieved successfully!

--- Summary (Secure Mode) ---
Authenticated: True
Payload Keys: ['apiKey']
Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.
```

If `EXAMPLE_CONFIG["print_credential_json"]` is set to `True`, the script will print the actual credentials in the following format:

```text
Retrieving credentials for target.example.com:443 using GitLab Trust Provider...
Credential retrieved successfully!

--- Credential Details ---
Type: ApiKey
Expires At: 2026-03-10T19:19:09.2559713Z
API Key: <api_key_value>
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If authentication succeeds but credential retrieval returns `401`, verify that `base_url` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### Empty `Payload Keys` on Success

This means the request reached Edge but did not match the expected access policy or service request shape.

Verify:

- `server_host` and `server_port`
- `credential_type`
- GitLab match conditions on your Client Workload (e.g., your GitLab Project Path matched case-sensitively)
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
The OIDC Identity Token must be protected securely.
