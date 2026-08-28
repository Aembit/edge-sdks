# Azure Functions Entra OIDC Example (Python)

Runnable Azure Functions example for using an Entra managed identity token with the existing Aembit OIDC Trust Provider flow.

This example uses the Python v2 programming model for Azure Functions.

## Prerequisites

- An Azure Function App running the Python v2 programming model on Python `>=3.10`
- Managed identity enabled for the function app
- An Entra app registration whose Application ID URI represents the Aembit audience for this flow
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

Example Server Workload configuration:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## How Token Sourcing Works

This example uses the SDK `OidcIdTokenTrustProvider`.

The Trust Provider reads the token from:

- `AZURE_ENTRA_ACCESS_TOKEN` for local development or controlled testing
- Azure managed identity via `ManagedIdentityCredential` in deployed Azure Functions

This is an Entra JWT access token used as the attestation artifact for the Aembit OIDC Trust Provider flow.

## Configure The Example

Open [`function_app.py`](./function_app.py) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `entra_audience`
- `managed_identity_client_id` when using a user-assigned managed identity
- `print_credential_json` if you want the full credential in the function response

Set `entra_audience` to the Entra Application ID URI for the audience you want the function's managed identity to request. The default Azure pattern is `api://<Application (client) ID>`. Do not include `/.default` in `EXAMPLE_CONFIG`; the example appends that scope suffix for you.

## Local Development

For local testing, set `AZURE_ENTRA_ACCESS_TOKEN`, and start the Azure Functions Core Tools:

```bash
export AZURE_ENTRA_ACCESS_TOKEN="your-local-entra-token-here"
func start
```

## Observe The Output

Invoke the function with a valid function key and inspect the returned JSON response.

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

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `print_credential_json` to `True` only for controlled testing.
Do not expose this example as a general credential broker for arbitrary callers.
