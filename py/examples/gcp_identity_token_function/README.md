# GCP Identity Token Function Example (Python)

Source example for using the Python SDK with the GCP Identity Token Trust Provider from a Google Cloud Run function-style HTTP handler.

## Prerequisites

- A Google Cloud runtime that can fetch an identity token from the metadata server
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before using this example, configure an Aembit Access Policy that includes:

- a Client Workload that uses the `GCP Identity Token` Client Identifier
- a GCP Identity Token Trust Provider
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- a Credential Provider that returns the requested credential type

For this flow, both the Client Workload and the Trust Provider match on the Google identity token's `email` claim.

References:

- GCP Identity Token Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/gcp-identity-token-trust-provider/>
- GCP Identity Token Client Identifier guide: <https://docs.aembit.io/user-guide/access-policies/client-workloads/identification/gcp-identity-token/>
- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## How Token Sourcing Works

This example keeps the GCP identity token source out of `EXAMPLE_CONFIG`.

The Trust Provider reads the token from:

- the GCP metadata server in production Google Cloud runtimes
- `GCP_IDENTITY_TOKEN` for controlled local testing

The metadata server request requires an `audience` query parameter. This example keeps that value explicit in `EXAMPLE_CONFIG` as `gcp_identity_token_audience`.

Use:

- `baseUrl`: `https://<tenant>.ec.<region>.aembit.io`
- `gcp_identity_token_audience`: `https://<tenant>.id.<region>.aembit.io`

## Function Entry Point

This example registers a Google Functions Framework HTTP function named `aembitGcpIdentityToken`.

If you create the function in the Google Cloud console or via `gcloud`, set the Function entry point to:

```text
aembitGcpIdentityToken
```

## Configure The Example

Edit [`main.py`](./main.py) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `gcp_identity_token_audience`
- `print_credential_json` if you want the full credential in the function response

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Local Development

For local testing, set `GCP_IDENTITY_TOKEN` and start your local HTTP function server:

```bash
export GCP_IDENTITY_TOKEN="your-local-gcp-token"
functions-framework --target=aembitGcpIdentityToken --port=8080
```

Then invoke the function:

```bash
curl http://localhost:8080
```

## Observe The Output

Invoke the function and inspect the returned JSON response.

By default, the handler returns safe metadata only:

```json
{
  "authenticated": true,
  "trustProviderId": "gcp-identity-token",
  "credentialType": "ApiKey",
  "credentialExpiresAt": "2026-03-10T19:19:09.2559713Z",
  "dataKeys": ["apiKey"]
}
```

If `print_credential_json` is set to `True` in `EXAMPLE_CONFIG`, the response includes the full credential payload instead.

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `print_credential_json` to `True` only for controlled testing.
