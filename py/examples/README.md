# Python Examples

Runnable Python examples for the Aembit Edge Python SDK.

Current runnable examples:

- [`logging_integration/`](./logging_integration/) - Standard logging and Loguru interception configuration
- [`aws_role/`](./aws_role/) - Using the built-in AWS Role Trust Provider with AWS Lambda, ECS, etc.
- [`aws_imds/`](./aws_imds/) - Using the built-in AWS Metadata Service (IMDS) Trust Provider with EC2 VMs
- [`azure_function_entra_oidc/`](./azure_function_entra_oidc/) - Azure Functions using Azure managed identity tokens via the Aembit OIDC Trust Provider
- [`azure_imds/`](./azure_imds/) - Using the built-in Azure Instance Metadata Service (IMDS) Trust Provider with Azure VMs
- [`gcp_identity_token_function/`](./gcp_identity_token_function/) - GCP Cloud Function using GCP identity tokens via the Aembit GCP Trust Provider
- [`oidc_vercel_function/`](./oidc_vercel_function/) - Vercel Serverless Function using Vercel OIDC tokens via the Aembit OIDC Trust Provider
- [`kubernetes_service_account/`](./kubernetes_service_account/) - Using the built-in Kubernetes Service Account Trust Provider within Kubernetes Pods
- [`oidc_symmetric/`](./oidc_symmetric/) - Using the OIDC Trust Provider with symmetrically signed HS256 keys locally or offline
- [`terraform_cloud/`](./terraform_cloud/) - Using the built-in Terraform Cloud Trust Provider

Examples must use placeholder values only and should remain small, runnable, and aligned with recommended SDK usage patterns.

## Execution Steps

The easiest way to run these examples is using [`uv`](https://github.com/astral-sh/uv).

### 1. Set Up Your Environment

First, export your AWS region (required for the AWS Role example):

```bash
# On Linux/macOS
export AWS_REGION=us-east-1

# On Windows (PowerShell)
$env:AWS_REGION="us-east-1"
```

### 2. Run the Examples

You can run any of the examples directly using `uv run`:

#### Run Logging Integration Example

```bash
uv run examples/logging_integration/standard_logging_example.py
```

#### Run AWS Role Example

```bash
uv run examples/aws_role/main.py
```

#### Run AWS Metadata Service (IMDS) Example

```bash
uv run examples/aws_imds/main.py
```

#### Run Azure IMDS Example

```bash
uv run examples/azure_imds/main.py
```

#### Run Kubernetes Service Account Example

```bash
uv run examples/kubernetes_service_account/main.py
```

#### Run OIDC Symmetric Key Example

```bash
uv run examples/oidc_symmetric/main.py
```

#### Run Terraform Cloud Example

```bash
uv run examples/terraform_cloud/main.py
```
