# Azure IMDS VM Example (Python)

Azure VM reference example for the Python SDK using Azure Instance Metadata Service attested data.

## Current Support Status

This example is intentionally kept in the repository, but it is not currently runnable end-to-end against the current Aembit Edge API.

Current known gaps outside the SDK:

- the Aembit Admin UI does not currently expose an Edge SDK Client ID in the Azure IMDS Trust Provider view
- the Aembit Edge API/backend does not currently extract the nonce from the Azure IMDS PKCS#7 signature blob even though backend logic expects the nonce

So:

- keep this example as a reference implementation
- use it for SDK development and future validation
- do not treat it as a currently supported production flow until the Edge API and UI catch up

This example follows the same pattern as the EC2 example:

- edit a small config block in [`./main.py`](./main.py)
- run `uv run examples/azure_imds/main.py` on an Azure VM

## Prerequisites

- Azure VM with Instance Metadata Service reachable at `169.254.169.254`
- Python `>=3.10` and `uv` installed on the VM
- A future Aembit Access Policy flow that supports Azure IMDS end-to-end

## Aembit Setup

The intended Aembit setup for this flow is:

- a Client Workload for the Azure VM identity
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- an Azure Instance Metadata Service Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

At the moment, that setup cannot be completed end-to-end because of the current Aembit UI and API gaps described above.

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Azure Instance Metadata Service Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/azure-metadata-service-trust-provider/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL
- `client_id`: your Edge SDK Client ID from the Azure Instance Metadata Service Trust Provider
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Running the Example on an Azure VM

From the `py` subdirectory:

```bash
uv run examples/azure_imds/main.py
```

## Expected Output

Once the backend feature gap is closed, the script will first print safe authenticated session summary, then print credential metadata.

Example successful output:

```text
Retrieving credentials for target.example.com:443...
Credential retrieved successfully!

--- Summary (Secure Mode) ---
Authenticated: True
Payload Keys: ['apiKey']
Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.
```

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
