# Azure Functions Entra OIDC Example (Python)

Runnable Azure Functions example for using an Entra managed identity token with the existing Aembit OIDC Trust Provider flow.

This example demonstrates how to configure and run the Python SDK inside an HTTP trigger Azure Function using the Python v2 programming model, retrieve an Entra ID token using `ManagedIdentityCredential`, and use the Aembit OIDC Trust Provider to retrieve credentials.

This endpoint is intended for controlled testing only and should not be exposed as a general credential proxy.

This directory includes:

- `function_app.py`: Azure Functions v2 HTTP trigger source containing the route handler

## Prerequisites

- An Azure Function App running the Python v2 programming model
- Managed identity enabled for the function app
- An Entra app registration whose Application ID URI represents the Aembit audience for this flow
- Python `>=3.10`
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before deploying this example, configure an Aembit Access Policy that includes:

- a Client Workload whose `Client Identifier` matches the Entra token `sub`
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- an OIDC ID Token Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

Recommended Aembit OIDC Trust Provider matching for this example:

- issuer (`iss`): your Entra tenant issuer
- audience (`aud`): the Entra Application ID URI used by this example

References:

- OIDC ID Token Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/oidc-id-token-trust-provider/>
- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## How Token Sourcing Works

This example uses the existing SDK OIDC Trust Provider.

The Trust Provider reads the token from:

- `AZURE_ENTRA_ACCESS_TOKEN` for local development or controlled testing
- Azure managed identity via `ManagedIdentityCredential` in deployed Azure Functions

This is an Entra JWT access token used as the attestation artifact for the Aembit OIDC Trust Provider flow.

## Configure The Example

Edit [`function_app.py`](./function_app.py) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL (e.g. `https://<tenant>.ec.<stack>.aembit.io`)
- `client_id`: your Edge SDK Client ID from the OIDC Trust Provider
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `entra_audience`: the Entra Application ID URI for the audience you want the function's managed identity to request (e.g. `api://your-aembit-tenant-app-id-uri`)
- `managed_identity_client_id`: optional, only if using a user-assigned managed identity
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Local Development

For local testing, set `AZURE_ENTRA_ACCESS_TOKEN` in your environment, and then run the Azure Functions Core Tools from this example directory:

```bash
# On Linux/macOS
export AZURE_ENTRA_ACCESS_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# On Windows (PowerShell)
$env:AZURE_ENTRA_ACCESS_TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Start functions-framework / core tools locally
func start
```

Then invoke the function locally:

```bash
curl http://localhost:7071/api/aembitAzureEntraOidc
```

This example does not attempt to emulate managed identity locally.

## Observe The Output

Invoke the function and inspect the returned JSON response.

By default, the handler returns safe metadata only:

```json
{
  "authenticated": true,
  "trustProviderId": "oidc-id-token",
  "credentialType": "ApiKey",
  "credentialExpiresAt": "2026-03-10T19:19:09.2559713Z",
  "dataKeys": ["apiKey"]
}
```

If `print_credential_json` is set to `True` in `EXAMPLE_CONFIG`, the response includes the full credential payload instead.

## Troubleshooting

### `401` on `/credentials` after successful auth

If authentication succeeds but credential retrieval returns `401`, verify that `base_url` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This indicates that the request reached Edge, but did not match the expected access policy or service request shape.

Verify:

- `server_host` and `server_port`
- `credential_type`
- OIDC token claim matching in the Client Workload / Trust Provider configuration
- `resource_set` if your tenant flow uses it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
Ensure the deployment files do not leak production secrets.
