# AWS Role Trust Provider Example (Python)

Runnable AWS IAM Role example for the Python SDK.

This example demonstrates how to configure and run the Python SDK using an AWS IAM Execution Role in AWS environments (such as AWS Lambda, ECS, EKS, or EC2):

- edit a small config block in [`./main.py`](./main.py)
- run the example using `uv`

## Prerequisites

- An active AWS execution environment (Lambda, ECS Task, EC2, etc.) running with an assigned IAM Role
- Python `>=3.9` installed on the instance/container
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your AWS Account ID or specific IAM Role
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- an AWS Role Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- AWS Role Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/aws-role-trust-provider/>
- AWS Role auth setup: <https://docs.aembit.io/api-guide/edge/auth/aws-role>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL
- `client_id`: your Edge SDK Client ID from the AWS Role Trust Provider
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Run The Example

Ensure your environment has active AWS credentials and region configured:

```bash
# On Linux/macOS
export AWS_REGION=us-east-1

# On Windows (PowerShell)
$env:AWS_REGION="us-east-1"
```

Then run the example using `uv`:

```bash
uv run examples/aws_role/main.py
```

## Output

The script first prints a safe authenticated session summary, then prints credential metadata.

By default, the credential output includes:

- `credential_type`
- `expires_at`
- `data_keys`

If `EXAMPLE_CONFIG.print_credential_json` is `True`, the script prints the full credential payload instead.

Example successful output:

```json
{
  "authenticated": true,
  "expiresAt": "2026-03-10T20:18:09.108Z",
  "trustProviderId": "aws-role"
}
{
  "credentialType": "ApiKey",
  "expiresAt": "2026-03-10T19:19:09.2559713Z",
  "dataKeys": [
    "apiKey"
  ]
}
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If `authenticate()` succeeds but credential retrieval returns `401`, verify that `base_url` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This means the request reached Edge but did not match the expected access policy or service request shape.

Verify:

- `server_host` and `server_port`
- `credential_type`
- IAM Role matching in your Client Workload (e.g. AWS Account ID, Role ARN)
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
