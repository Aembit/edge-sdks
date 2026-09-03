# AWS Role Trust Provider Example

This runnable example demonstrates how to configure and use the Aembit Edge Python SDK with the built-in **AWS Role Trust Provider** in AWS execution environments (such as AWS Lambda, ECS, EKS, or EC2).

---

## How it Works

In AWS execution environments (e.g. Lambda, ECS Fargate), your code runs with an assigned IAM Role. The AWS environment automatically exposes temporary, rotating IAM execution credentials on the local environment.

The `AwsRoleTrustProvider` automatically:
1. Reuses your local IAM execution credentials (automatically loaded from the standard AWS SDK environment, such as instance metadata or task metadata endpoints).
2. Uses these credentials to dynamically sign a secure AWS Security Token Service (STS) `GetCallerIdentity` API request.
3. Packages this signed request as a secure, cryptographic proof of identity to submit to the Aembit Edge API. Aembit then validates this STS request with AWS to safely verify your workload's active IAM Role.

---

## 1. Aembit Console Configuration

To use this example, configure your Aembit tenant to trust your AWS IAM Role:

### A. Create an AWS Role Trust Provider
1. Log in to your Aembit Console (e.g. `https://<tenant-id>.aembit.io`).
2. Navigate to **Trust Providers** > **New** > **AWS Role**.
3. Add at least one **Match Rule** (at least one is required). Select from the dropdown:
   - **`roleArn`**: e.g., `arn:aws:iam::123456789012:role/my-workload-role` (matches the full AWS IAM Role ARN).
   - **`accountId`**: e.g., `123456789012` (matches the AWS Account ID).
   - **`assumedRole`**: e.g., `my-workload-role` (matches the IAM Role name).
   - **`userId`**: Matches the AWS unique User ID of the role.
4. Save the configuration.

### B. Create a Client Workload
1. Navigate to **Client Workloads** > **New**.
2. Under the **Client Identification** configuration, select **AWS Account ID** (or **AWS Role**) from the dropdown and paste your AWS Account ID (e.g., `123456789012`).
3. Save the Client Workload.

### C. Create an Access Policy
1. Navigate to **Access Policies** > **New**.
2. Attach your **Client Workload**, your target **Server Workload**, your **Trust Provider**, and your desired **Credential Provider**.
3. **Important:** Once everything is in place, ensure the Access Policy is set to **Active**.

---

## 3. Running the Example

Update the `EXAMPLE_CONFIG` parameters in `main.py` with your custom coordinates:

```python
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:aws_role:<provider-external-id>",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}
```

Ensure your terminal has active AWS credentials / region configured:

```bash
# On Linux/macOS
export AWS_REGION=us-east-1

# On Windows (PowerShell)
$env:AWS_REGION="us-east-1"
```

Run the example using `uv`:

```bash
uv run examples/aws_role/main.py
```
