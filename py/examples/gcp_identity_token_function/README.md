# GCP Cloud Function Example (Python)

Runnable Google Cloud Function (GCF) example for the Python SDK using GCP Identity Tokens.

This example demonstrates how to configure and run the Python SDK inside an HTTP Google Cloud Function:

- edit a small config block in [`./main.py`](./main.py)
- deploy the function to Google Cloud Provider (GCP)
- test it via an HTTP GET request

## Prerequisites

- A Google Cloud Platform (GCP) account and active project
- The Google Cloud CLI (`gcloud` CLI) installed locally
- Python `>=3.10`
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your GCP Service Account (e.g. matching `email` or unique ID)
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- a GCP Identity Token Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- GCP Identity Token Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/gcp-identity-token-trust-provider/>
- GCP Identity Token auth setup: <https://docs.aembit.io/api-guide/edge/auth/gcp-identity-token>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `target.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL (e.g. `https://<tenant>.ec.<stack>.aembit.io`)
- `client_id`: your Edge SDK Client ID from the GCP Trust Provider
- `gcp_identity_token_audience`: your Aembit tenant identity URL (e.g. `https://<tenant>.id.<stack>.aembit.io`)
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Deploy The Function To GCP

We've packaged this example with a standard GCP configuration. To deploy it:

1. Copy both `main.py` and `requirements.txt` into a clean deployment directory or deploy directly from this folder.
2. Initialize `gcloud` and log in to your account.
3. Deploy the function using the `gcloud` CLI:

> [!NOTE]
> This command deploys the function with `--no-allow-unauthenticated` to ensure the endpoint is secure and authenticated by default. To allow unauthenticated access for testing or demonstration, you can change this flag to `--allow-unauthenticated`.

```bash
gcloud functions deploy aembitGcpIdentityToken \
  --runtime python310 \
  --entry-point aembit_gcp_identity_token \
  --trigger-http \
  --no-allow-unauthenticated \
  --region us-central1
```

Once deployment completes, the CLI will output your function's public HTTP trigger URL:

- `https://us-central1-<project-id>.cloudfunctions.net/aembitGcpIdentityToken`

## Run The Example

Send an HTTP GET request to your deployed Cloud Function using `curl` or your browser:

```bash
curl "https://us-central1-<project-id>.cloudfunctions.net/aembitGcpIdentityToken"
```

## Output

The function first prints a safe authenticated session summary, then prints credential metadata in a clean JSON response.

By default, the credential output includes:

- `credentialType`
- `credentialExpiresAt`
- `dataKeys`

Example successful output:

```json
{
  "authenticated": true,
  "trustProviderId": "gcp-identity-token",
  "credentialType": "ApiKey",
  "credentialExpiresAt": "2026-03-10T19:19:09.2559713Z",
  "dataKeys": [
    "apiKey"
  ]
}
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If authentication succeeds but credential retrieval returns `401`, verify that `base_url` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This means the request reached Edge but did not match the expected access policy or service request shape.

Verify:

- `server_host` and `server_port`
- `credential_type`
- GCF Service Account email matching in your Client Workload
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
Ensure the deployment files (`main.py`) do not leak production secrets.
