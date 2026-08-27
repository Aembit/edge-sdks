# Azure IMDS VM Example

Azure VM reference example for the TypeScript SDK using Azure Instance Metadata Service attested data.

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

- edit a small config block in [`./index.ts`](./index.ts)
- bundle the example into a single `index.mjs`
- copy that built file to an Azure VM
- run `node index.mjs`

## Prerequisites

- Azure VM with Instance Metadata Service reachable at `169.254.169.254`
- Node.js `>=20` installed on the VM
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

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./index.ts`](./index.ts) and update `EXAMPLE_CONFIG`:

- `baseUrl`: your tenant's regional Aembit Edge URL
- `clientId`: your Edge SDK Client ID from the Azure Instance Metadata Service Trust Provider
- `serverHost` and `serverPort`: the Service Endpoint from your Server Workload
- `credentialType`: the credential type returned by your Credential Provider
- `resourceSet`: optional, only when your tenant flow requires it
- `printCredentialJson`: set to `true` only when you explicitly want the full credential printed

`serverHost` and `serverPort` must exactly match the Service Endpoint values configured in your Server Workload.

## Build The Bundle

Run from `ts/`:

```bash
npm run build:example:azure-imds-vm
```

This creates:

- `./examples/azure-imds-vm/dist/index.mjs`

You can also build and run the bundled example locally on an Azure VM for SDK development once backend support is available:

```bash
npm run example:azure-imds-vm
```

## Deploy The Bundle To An Azure VM

This deploy workflow is kept as a reference for when the backend feature gap is closed.

From `ts/`, copy the built artifact to your Azure VM:

```bash
scp -i ~/.ssh/your-key.pem ./examples/azure-imds-vm/dist/index.mjs azureuser@<vm-host>:~/index.mjs
```

On the Azure VM:

```bash
node index.mjs
```

## Expected Output

Once the backend feature gap is closed, the script will first print a safe authenticated session summary, then print credential metadata.

By default, the credential output includes:

- `credentialType`
- `expiresAt`
- `dataKeys`

If `EXAMPLE_CONFIG.printCredentialJson` is `true`, the script prints the full credential payload instead.

Example successful output:

```json
{
  "authenticated": true,
  "expiresAt": "2026-03-17T10:21:04.108Z",
  "trustProviderId": "azure-metadata-service"
}
{
  "credentialType": "ApiKey",
  "expiresAt": "2026-03-17T09:22:04.2559713Z",
  "dataKeys": [
    "apiKey"
  ]
}
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If `authenticate()` succeeds but credential retrieval returns `401`, verify that `baseUrl` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<region>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This means the request reached Edge but did not match the expected access policy or service request shape.

Verify:

- `serverHost` and `serverPort`
- `credentialType`
- Azure VM Client Workload matching
- `resourceSet`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `printCredentialJson` only for controlled testing.
