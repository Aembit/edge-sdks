# Azure Functions Entra OIDC Example

Runnable Azure Functions example for using an Entra managed identity token with the existing Aembit OIDC Trust Provider flow.

This example keeps the Azure Functions source layout idiomatic and also supports a manual zip deployment workflow with local packaging of runtime dependencies.

This endpoint is intended for controlled testing only and should not be exposed as a general credential proxy.

This directory includes:

- `src/functions/aembitAzureEntraOidc.ts`: Azure Functions v4 HTTP trigger source
- `host.json`: Azure Functions host configuration
- `package.json`: example project metadata
- `package.deploy.json`: template used to generate the deployable package manifest for the packaged app

## Prerequisites

- An Azure Function App running the Node.js v4 programming model
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

Edit [`src/functions/aembitAzureEntraOidc.ts`](./src/functions/aembitAzureEntraOidc.ts) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `entraAudience`
- `managedIdentityClientId` when using a user-assigned managed identity
- `printCredentialJson` if you want the full credential in the function response

Set `entraAudience` to the Entra Application ID URI for the audience you want the function's managed identity to request. The default Azure pattern is `api://<Application (client) ID>`. Do not include `/.default` in `EXAMPLE_CONFIG`; the example appends that scope suffix for you. `entraAudience` should stay stable for this flow because the Entra token `sub` is audience-dependent and the Client Workload identifier is expected to match that `sub`.

## Build The Deploy Package

Run from `ts/`:

```bash
npm run build:example:azure-function-entra-oidc
```

This creates a self-contained Azure Functions app under:

- `./examples/azure-function-entra-oidc/dist/deploy/`

Contents include:

- `host.json`
- `package.json`
- `src/functions/aembitAzureEntraOidc.js`
- production `node_modules/` installed from `package.deploy.json`

The build step runs a local `npm install --omit=dev` in `dist/deploy`, so the zip artifact contains the runtime dependencies Azure Functions needs at startup.

## Build The Zip Artifact

Run from `ts/`:

```bash
npm run example:azure-function-entra-oidc:zip
```

This creates:

- `./examples/azure-function-entra-oidc/dist/azure-function-entra-oidc.zip`

The zip is structured so `host.json` is at the archive root, which matches Azure zip deployment expectations. Because the runtime dependencies are packaged locally, this artifact is ready for a normal zip deployment without requiring Azure-side remote build.

## Manual Zip Deployment

Deploy the generated zip with Azure CLI:

```bash
az functionapp deployment source config-zip \
  --resource-group <resource-group> \
  --name <function-app-name> \
  --src ./ts/examples/azure-function-entra-oidc/dist/azure-function-entra-oidc.zip
```

The function uses `authLevel: "function"`, so callers must present a valid function key, such as with the `x-functions-key` header or a `code` query parameter.

## Local Development

For local testing, set `AZURE_ENTRA_ACCESS_TOKEN`, build the example, and then run Azure Functions Core Tools from this example directory:

```bash
npm run build:example:azure-function-entra-oidc
cd examples/azure-function-entra-oidc
func start
```

The example package points the Functions host at `dist/deploy/src/functions/*.js`, so you must rebuild after source changes before restarting the local host.

This example does not attempt to emulate managed identity locally.

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

If `printCredentialJson` is set to `true` in `EXAMPLE_CONFIG`, the response includes the full credential payload instead.

## Troubleshooting

### Missing Entra token

If the function fails because no Entra token is available, verify:

- local development sets `AZURE_ENTRA_ACCESS_TOKEN`, or
- managed identity is enabled on the deployed function app

### `401` on `/credentials`

Verify that `baseUrl` in `EXAMPLE_CONFIG` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This indicates that the request reached Edge, but did not match the expected access policy or service request shape.

Verify:

- `serverHost` and `serverPort`
- `credentialType`
- Entra token `iss`, `aud`, and `sub` alignment with the Aembit Trust Provider and Client Workload configuration
- `resourceSet` if your tenant flow uses it

## Security Note

Do not use real secrets in shared logs or screenshots.
Set `printCredentialJson` to `true` only for controlled testing.
Do not expose this example as a general credential broker for arbitrary callers.
