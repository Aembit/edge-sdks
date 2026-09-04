# Terraform Cloud Trust Provider Example

This runnable example demonstrates how to configure and use the Aembit Edge Python SDK with the built-in **Terraform Cloud Trust Provider**.

In Terraform Cloud (TFC) and Terraform Enterprise (TFE), you can inject secure workload identity tokens into steps, which Aembit can validate, rather than hardcoding static, long-lived credentials into your workspace variables.

---

## 1. Aembit Console Configuration

To use this example, configure your Aembit tenant to trust your Terraform workspace:

### A. Create a Terraform Cloud Trust Provider
1. Log in to your Aembit Console (e.g. `https://<tenant-id>.aembit.io`).
2. Navigate to **Trust Providers** > **New** > **Terraform Cloud Identity Token**.
3. Configure the following properties:
   - **Name:** e.g., `Terraform Cloud TP`
   - **Match Rules:** Add at least one Match Rule (at least one is required). Select from the dropdown:
     - **`terraformOrganizationId`**: e.g., `org-xyz123` (matches your TFC Organization ID).
     - **`terraformProjectId`**: e.g., `prj-xyz123` (matches your TFC Project ID).
     - **`terraformWorkspaceId`**: e.g., `ws-xyz123` (matches your TFC Workspace ID).
4. Save the configuration.

### B. Create a Client Workload
1. Navigate to **Client Workloads** > **New**.
2. Under the **Client Identification** configuration, select **Terraform Identity Token Workspace ID** (or Project ID, etc.) from the dropdown and paste your TFC Workspace ID (e.g., `ws-xyz123`).
3. Save the Client Workload.

### C. Create an Access Policy
1. Navigate to **Access Policies** > **New**.
2. Attach your **Client Workload**, your target **Server Workload** (the database or API you want credentials for), your **Trust Provider**, and your desired **Credential Provider**.
3. **Important:** Once everything is in place, ensure the Access Policy is set to **Active**.

---

## 3. Running the Example

Update the `EXAMPLE_CONFIG` parameters in `main.py` with your custom coordinates:

```python
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:terraform_idtoken:<provider-external-id>",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}
```

Ensure your terminal has an identity token configured (in TFC, this is automatic, but for local testing you must export it manually):

```bash
# On Linux/macOS
export TFC_WORKLOAD_IDENTITY_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# On Windows (PowerShell)
$env:TFC_WORKLOAD_IDENTITY_TOKEN="eyJhbGciOiJSUzI1NiIs..."
```

Run the example using `uv`:

```bash
uv run examples/terraform_cloud/main.py
```
