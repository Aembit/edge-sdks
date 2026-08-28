# OIDC Vercel Function Example (Python)

Runnable Vercel Function example for testing the Python SDK with the OIDC ID Token Trust Provider.

This directory includes:

- `api/index.py`: Vercel Function source example exporting a `handler` class
- `package.json`: minimal package metadata for the example project

## Prerequisites

- A Vercel project with OIDC federation enabled
- A Vercel Function running on the Python runtime
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before deploying this example, configure an Aembit Access Policy that includes:

- a Client Workload that matches your OIDC token-based identity model
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- an OIDC ID Token Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

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

This example keeps the OIDC token source out of `EXAMPLE_CONFIG`.

The Trust Provider reads the token from:

- `x-vercel-oidc-token` request header in production Vercel Functions
- `VERCEL_OIDC_TOKEN` environment variable for local development

This matches Vercel's current OIDC behavior:

- Vercel Functions: the OIDC token is available on the request header
- Local development: `vercel env pull` writes `.env.local`, which should include `VERCEL_OIDC_TOKEN=...`

References:

- Vercel OIDC federation: <https://vercel.com/docs/oidc>
- Vercel Functions: <https://vercel.com/docs/functions>

## Configure The Example

Edit [`api/index.py`](./api/index.py) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `print_credential_json` if you want the full credential in the function response

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Local Development

Run from this example directory so Vercel creates local project state and writes `.env.local` there:

```bash
cd examples/oidc_vercel_function
vercel env pull
vercel dev
```

Then invoke the function locally:

```bash
curl http://localhost:3000/api
```

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

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `print_credential_json` to `True` only for controlled testing.
