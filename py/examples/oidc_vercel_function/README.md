# OIDC Vercel Function Example (Python)

Runnable Vercel Function example for testing the Python SDK with the OIDC ID Token Trust Provider.

This directory includes:

- `api/index.py`: Vercel Function source example exporting a `GET` route handler

## Prerequisites

- A Vercel project with OIDC federation enabled
- A Vercel Function running on the Python runtime
- Python `>=3.10`
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

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `target.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## How Token Sourcing Works

This example keeps the OIDC token source out of `EXAMPLE_CONFIG`.

The Trust Provider reads the token from:

- `x-vercel-oidc-token` request header in production Vercel Functions
- `VERCEL_OIDC_TOKEN` environment variable for local development

That matches Vercel's current OIDC behavior:

- Vercel Functions: the OIDC token is available on the request header
- Local development: `vercel env pull` writes `.env.local`, which should
  include `VERCEL_OIDC_TOKEN=...`

References:

- Vercel OIDC federation: <https://vercel.com/docs/oidc>
- Vercel Functions: <https://vercel.com/docs/functions>

## Configure The Example

Edit [`api/index.py`](./api/index.py) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL (e.g. `https://<tenant>.ec.<stack>.aembit.io`)
- `client_id`: your Edge SDK Client ID from the OIDC Trust Provider
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Local Development

Run from the example directory so Vercel creates local project state and
writes `.env.local` there:

```bash
cd py/examples/oidc_vercel_function
vercel env pull
vercel dev
```

Then invoke the function locally:

```bash
curl http://localhost:3000/api
```

## Production Deployment

This example is structured as a standard Vercel Python Serverless Function and depends on the published `aembit-edge-sdk` package configured in `requirements.txt`.

To deploy this function to production:

```bash
cd py/examples/oidc_vercel_function
vercel --prod
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

## Troubleshooting

### Missing OIDC token

If the function fails with `Missing Vercel OIDC token...`, verify:

- production requests are running on Vercel Functions, or
- local development ran `vercel env pull` in `py/examples/oidc_vercel_function/`
- the generated `.env.local` contains `VERCEL_OIDC_TOKEN=...`

### `401` on `/credentials`

Verify that `base_url` in `EXAMPLE_CONFIG` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

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
