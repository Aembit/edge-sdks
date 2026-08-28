# OIDC Vercel Function Example

Runnable Vercel Function example for testing the TypeScript SDK with the OIDC ID Token Trust Provider.

This directory includes:

- `api/index.ts`: Vercel Function source example exporting a `GET` route handler
- `package.json`: minimal package metadata for the example project

## Prerequisites

- A Vercel project with OIDC federation enabled
- A Vercel Function running on the Node.js runtime
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
- Host: `test.example.com`
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

Edit [`api/index.ts`](./api/index.ts) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `printCredentialJson` if you want the full credential in the function response

`serverHost` and `serverPort` must exactly match the Service Endpoint values configured in your Server Workload.

## Local Development

Run from the example directory so Vercel creates local project state and
writes `.env.local` there:

```bash
cd examples/oidc-vercel-function
vercel env pull
vercel dev
```

Then invoke the function locally:

```bash
curl http://localhost:3000/api
```

## Production Deployment Status

This example currently documents local development only.

Why:

- the example imports the unreleased local SDK source from `ts/src/`
- that works in this repository checkout and with `vercel dev`
- it is not yet a self-contained production deploy target for Vercel

Production deployment guidance should be added once the TypeScript SDK is
published and this example can depend on the package as a normal installable
dependency.

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

If `printCredentialJson` is set to `true` in `EXAMPLE_CONFIG`, the response includes the full credential payload instead.

## Troubleshooting

### Missing OIDC token

If the function fails with `Missing Vercel OIDC token...`, verify:

- production requests are running on Vercel Functions, or
- local development ran `vercel env pull` in `examples/oidc-vercel-function/`
- the generated `.env.local` contains `VERCEL_OIDC_TOKEN=...`

### `401` on `/credentials`

Verify that `baseUrl` in `EXAMPLE_CONFIG` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This indicates that the request reached Edge, but did not match the expected access policy or service request shape.

Verify:

- `serverHost` and `serverPort`
- `credentialType`
- OIDC token claim matching in the Client Workload / Trust Provider configuration
- `resourceSet` if your tenant flow uses it

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `printCredentialJson` to `true` only for controlled testing.
