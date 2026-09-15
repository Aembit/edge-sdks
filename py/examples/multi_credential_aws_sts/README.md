# Multi-Credential Provider (Multi-CP) AWS STS Federation Example (Python)

Runnable example demonstrating the Python SDK with a Multi-Credential Provider Access Policy and AWS STS Federation multi-credential selection using `connection_metadata={"accessKeyId": ...}`.

This example demonstrates how to configure and run the Python SDK:

- edit a small config block in [`./main.py`](./main.py)
- run the example using `uv`

## Multi-Credential Provider Access Policy (Required)

This example requires an Aembit Access Policy configured with **multiple AWS STS Federation Credential Providers**.

In complex environments, workloads often need to access different AWS services or assume different IAM roles (for example, one role for Amazon S3 access and another role for Amazon DynamoDB access). Rather than requiring separate Access Policies or multiple workload identities, Aembit allows attaching multiple Credential Providers to a single Access Policy.

In a Multi-CP configuration for AWS STS Federation:

1. Each AWS STS Federation Credential Provider configured in the Access Policy is assigned a unique placeholder **Access Key ID** selector (for example, `AKIADUMMYFORROLEA` for S3 access, and `AKIADUMMYFORROLEB` for DynamoDB access).
2. When the application requests credentials via the Edge SDK, it specifies the target role by passing the selector in `connection_metadata`:

```python
credential_input = GetCredentialInput(
    server=CredentialServerRef(host="target.example.com", port=443),
    credential_type="AwsStsFederation",
    connection_metadata={"accessKeyId": "AKIADUMMYFORROLEA"},
)
result = client.get_credential(credential_input)
```

Aembit uses the `accessKeyId` selector to identify the matching AWS STS Federation Credential Provider, assumes the associated IAM role, and returns temporary AWS credentials (`awsAccessKeyId`, `awsSecretAccessKey`, `awsSessionToken`).

The returned dictionary can be type-cast to [`AwsStsData`](file:///Users/mgavrilov/src/edge-sdks/py/src/aembit_edge/types.py) for static type checking:

```python
from typing import cast
from aembit_edge import AwsStsData

sts_data = cast(AwsStsData, result.data)
aws_access_key = sts_data["awsAccessKeyId"]
```

> **Note:** This example uses the Kubernetes Service Account Trust Provider to authenticate the workload, but the multi-CP selector mechanism works identically with any Trust Provider.

## Prerequisites

- A Kubernetes cluster with a mounted Service Account token, or an environment variable `AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN` for local testing
- Python `>=3.10` installed on your execution machine
- An Aembit Access Policy with multiple AWS STS Federation Credential Providers configured

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL
- `client_id`: your Edge SDK Client ID from the Trust Provider configuration
- `server_host` and `server_port`: the Service Endpoint from your Server Workload (e.g. `target.example.com:443` or an AWS service endpoint)
- `credential_type`: `"AwsStsFederation"`
- `access_key_id_selector`: Access Key ID selector mapped to your target AWS STS Federation Credential Provider (e.g. `AKIADUMMYFORROLEA`)
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

## Run The Example

### In Kubernetes

Deploy and run in a Pod with a service account mounted:

```bash
uv run examples/multi_credential_aws_sts/main.py
```

### Local Testing

For local testing outside Kubernetes, export a test token and run with `uv`:

```bash
# On Linux/macOS
export AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN="mock-k8s-token"
uv run examples/multi_credential_aws_sts/main.py

# On Windows (PowerShell)
$env:AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN="mock-k8s-token"
uv run examples/multi_credential_aws_sts/main.py
```

## Security Note

Never commit real credentials or production tokens to source control.
Always use environment variables or Kubernetes projected tokens in workloads.
