# Azure Metadata Service (IMDS) Example (Python)

Runnable Azure VM example for the Python SDK using Azure IMDS.

This example demonstrates how to configure and run the Python SDK on an Azure Virtual Machine (VM):

- edit a small config block in [`./main.py`](./main.py)
- copy the file to an Azure VM
- run the example using `uv`

## Prerequisites

- An Azure Virtual Machine (VM) running in your Azure subscription
- Python `>=3.9` installed on the VM
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your Azure VM (e.g. matching Subscription ID, Resource Group, VM Name, or Tenant ID)
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- an Azure Metadata Service Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Azure Metadata Service Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/azure-metadata-service-trust-provider/>
- Azure Metadata Service auth setup: <https://docs.aembit.io/api-guide/edge/auth/azure-metadata-service>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL
- `client_id`: your Edge SDK Client ID from the Azure Trust Provider
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Deploy and Run the Example

From the root of the SDK repo, copy `main.py` directly to your Azure VM:

```bash
scp -i ~/.ssh/your-key.pem ./py/examples/azure_imds/main.py azureuser@<azure-vm-ip>:~/main.py
```

On the Azure VM, run using `uv`:

```bash
# Install uv locally if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Execute the example
uv run main.py
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
  "trustProviderId": "azure-metadata-service"
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
- Azure VM Client Workload matching (such as Resource Group, Subscription ID, or VM Name)
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
