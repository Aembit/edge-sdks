# GCP Identity Token Function Example

Source example for using the TypeScript SDK with the GCP Identity Token Trust
Provider from a Google Cloud Run function-style HTTP handler.

This directory includes:

- `index.ts`: example function handler source
- `package.json`: minimal package metadata for the function project

## Prerequisites

- A Google Cloud runtime that can fetch an identity token from the metadata
  server
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before using this example, configure an Aembit Access Policy that includes:

- a Client Workload that uses the `GCP Identity Token` Client Identifier
- a GCP Identity Token Trust Provider
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK
  request will target
- a Credential Provider that returns the requested credential type

For this flow, both the Client Workload and the Trust Provider match on the
Google identity token's `email` claim.

References:

- GCP Identity Token Trust Provider guide:
  <https://docs.aembit.io/user-guide/access-policies/trust-providers/gcp-identity-token-trust-provider/>
- GCP Identity Token Client Identifier guide:
  <https://docs.aembit.io/user-guide/access-policies/client-workloads/identification/gcp-identity-token/>
- Server Workload guide:
  <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide:
  <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## How Token Sourcing Works

This example keeps the GCP identity token source out of `EXAMPLE_CONFIG`.

The Trust Provider reads the token from:

- the GCP metadata server in production Google Cloud runtimes
- `GCP_IDENTITY_TOKEN` for controlled local testing

The metadata server request requires an `audience` query parameter. This
example keeps that value explicit in `EXAMPLE_CONFIG` as
`gcpIdentityTokenAudience`.

Important:

- Google requires the audience to mint the token
- use the Aembit identity host for this value, for example:
  `https://<tenant>.id.<region>.aembit.io`
- Aembit policy matching for this flow is based on the token's `email` claim

References:

- Get an ID token from the metadata server:
  <https://docs.cloud.google.com/docs/authentication/get-id-token>
- Cloud Run service identity:
  <https://docs.cloud.google.com/run/docs/securing/service-identity>
- Write HTTP Cloud Run functions:
  <https://docs.cloud.google.com/run/docs/write-http-functions>

## Configure The Example

Edit [`index.ts`](./index.ts) and replace the placeholder values in
`EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `gcpIdentityTokenAudience`
- `printCredentialJson` if you want the full credential in the function
  response

`serverHost` and `serverPort` must exactly match the Service Endpoint values
configured in your Server Workload.

Use:

- `baseUrl`: `https://<tenant>.ec.<region>.aembit.io`
- `gcpIdentityTokenAudience`: `https://<tenant>.id.<region>.aembit.io`

## Function Entry Point

This example registers a Google Functions Framework HTTP function named
`aembitGcpIdentityToken`.

If you create the function in the Google Cloud console or via `gcloud`, set the
Function entry point to:

```text
aembitGcpIdentityToken
```

## Current Status

This example currently documents the source pattern and Aembit policy setup.

It does not yet document a full production deployment workflow, because the
example imports the unreleased local SDK source from `ts/src/`. Production
deployment guidance should be added once the TypeScript SDK can be consumed as
an installable package or this example has a finalized packaging workflow.

## Console Testing Workaround

If you need to test this example now from the Google Cloud console editor, you
can build a single bundled `index.js` locally and paste that output into the
editor.

Run from `ts/`:

```bash
npm run build:example:gcp-identity-token-function
```

This produces:

- `examples/gcp-identity-token-function/dist/index.js`
- `examples/gcp-identity-token-function/dist/package.json`

Temporary manual test workflow:

1. Copy `dist/index.js` into the Google code editor as `index.js`
2. Copy `dist/package.json` into the Google code editor as `package.json`
3. Set the Function entry point to `aembitGcpIdentityToken`

This is a temporary testing path until the SDK is package-installable or the
example has a finalized deployment workflow.

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

If `printCredentialJson` is set to `true` in `EXAMPLE_CONFIG`, the response
includes the full credential payload instead.

## Troubleshooting

### Missing GCP identity token

If the function fails to fetch a token, verify:

- the code is running on a Google Cloud runtime with a service account attached,
  or
- `GCP_IDENTITY_TOKEN` is set for controlled local testing
- the metadata request includes the required `Metadata-Flavor: Google` header

### `401` on `/auth`

Verify:

- `clientId` in `EXAMPLE_CONFIG`
- the service account email in the token matches both:
  - the Aembit Client Workload `GCP Identity Token` identifier
  - the GCP Identity Token Trust Provider match rule

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This indicates that the request reached Edge, but did not match the expected
access policy or service request shape.

Verify:

- `serverHost` and `serverPort`
- `credentialType`
- `resourceSet` if your tenant flow uses it

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `printCredentialJson` to `true` only for controlled testing.
