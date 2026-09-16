# GitHub Actions OIDC Example (Python)

Runnable GitHub Actions example for the Python SDK using GitHub OIDC.

This example demonstrates how to configure and run the Python SDK inside a GitHub Actions workflow:

- edit a small config block in [`./main.py`](./main.py)
- configure your GitHub workflow permissions to request an OIDC ID token
- run the example using `uv` inside your GitHub runner

## Prerequisites

- A GitHub repository hosting your workflows
- A workflow file configured with the required OIDC permissions:

  ```yaml
  permissions:
    id-token: write
    contents: read
  ```

- Python `>=3.10`
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your GitHub Repository (e.g. matching `githubIdTokenRepository` claim `your-org/your-repo`)
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- a GitHub Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- GitHub Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/github-trust-provider/>
- GitHub OIDC auth setup: <https://docs.aembit.io/api-guide/edge/auth/github-id-token>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `target.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL (e.g. `https://<tenant>.ec.<stack>.aembit.io`)
- `client_id`: your Edge SDK Client ID from the GitHub Trust Provider
- `aembit_identity_audience`: your Aembit tenant identity URL (e.g. `https://<tenant>.id.<stack>.aembit.io`)
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Deploy and Run the Example

### 1. In a GitHub Actions Workflow

Ensure your workflow contains the `id-token: write` permission block. The Python SDK will dynamically talk to GitHub's runtime metadata server to fetch the OIDC token on the fly!

Create or update a workflow file (e.g. `.github/workflows/aembit-sdk-test.yml`):

```yaml
name: Run Aembit SDK Example

on: [push]

jobs:
  run-sdk:
    runs-on: ubuntu-latest
    permissions:
      id-token: write     # REQUIRED for OIDC token fetch
      contents: read
    steps:
      - name: Checkout Code
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - name: Set up Python
        uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7
        with:
          update-environment: true
          python-version: '3.11'

      - name: Install uv
        uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1

      - name: Run Aembit Example
        run: |
          cd py
          uv run examples/github_actions/main.py
```

### 2. Locally (For Development / Mock Testing)

To test the script locally without running it on a GitHub Actions runner, fetch or construct a test JWT token, export it to your shell, and run:

```bash
# On Linux/macOS
export GITHUB_IDENTITY_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# On Windows (PowerShell)
$env:GITHUB_IDENTITY_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Execute locally
cd py
uv run examples/github_actions/main.py
```

## Output

The script prints the progress and a safe authenticated session summary.

Example successful output:

```text
Retrieving credentials for target.example.com:443 using GitHub Trust Provider...
Credential retrieved successfully!

--- Summary (Secure Mode) ---
Authenticated: True
Payload Keys: ['apiKey']
Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.
```

If `EXAMPLE_CONFIG["print_credential_json"]` is set to `True`, the script will print the actual credentials in the following format:

```text
Retrieving credentials for target.example.com:443 using GitHub Trust Provider...
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
- Repository email/match conditions on your Client Workload (e.g., `githubIdTokenRepository` is set to exactly `your-org/your-repo` case-sensitively)
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
The OIDC Identity Token must be protected securely.
