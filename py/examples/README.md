# Python Examples

Runnable Python examples for the Aembit Edge Python SDK.

Current runnable examples:

- [`logging_integration/`](./logging_integration/) - Standard logging and Loguru interception configuration
- [`aws_role/`](./aws_role/) - Using the built-in AWS Role Trust Provider with AWS Lambda, ECS, etc.
- [`aws_imds/`](./aws_imds/) - Using the built-in AWS Metadata Service (IMDS) Trust Provider with EC2 VMs

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
