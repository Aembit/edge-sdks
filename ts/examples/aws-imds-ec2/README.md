# AWS IMDS EC2 Example

Runnable EC2 example for the TypeScript SDK using AWS IMDSv2.

This example follows the same pattern as the Lambda example:

- edit a small config block in [`./index.ts`](./index.ts)
- bundle the example into a single `index.mjs`
- copy that built file to an EC2 instance
- run `node index.mjs`

## Prerequisites

- EC2 instance with IMDSv2 enabled and reachable at `169.254.169.254`
- Node.js `>=20` installed on the instance
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload for the EC2 instance identity
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- an AWS Metadata Service Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- AWS Metadata Service Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/aws-metadata-service-trust-provider/>
- AWS Metadata Service auth setup: <https://docs.aembit.io/api-guide/edge/auth/aws-metadata-service>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./index.ts`](./index.ts) and update `EXAMPLE_CONFIG`:

- `baseUrl`: your tenant's regional Aembit Edge URL
- `clientId`: your Edge SDK Client ID from the AWS Metadata Service Trust Provider
- `serverHost` and `serverPort`: the Service Endpoint from your Server Workload
- `credentialType`: the credential type returned by your Credential Provider
- `resourceSet`: optional, only when your tenant flow requires it
- `printCredentialJson`: set to `true` only when you explicitly want the full credential printed

`serverHost` and `serverPort` must exactly match the Service Endpoint values configured in your Server Workload.

## Build The Bundle

Run from `ts/`:

```bash
npm run build:example:aws-imds-ec2
```

This creates:

- `./examples/aws-imds-ec2/dist/index.mjs`

You can also run the bundled example locally on an EC2 instance with:

```bash
npm run example:aws-imds-ec2
```

## Deploy The Bundle To EC2

From `ts/`, copy the built artifact to your EC2 instance:

```bash
scp -i ~/.ssh/your-key.pem ./examples/aws-imds-ec2/dist/index.mjs ubuntu@<ec2-host>:~/index.mjs
```

On the EC2 instance:

```bash
node index.mjs
```

## Output

The script first prints a safe authenticated session summary, then prints credential metadata.

By default, the credential output includes:

- `credentialType`
- `expiresAt`
- `dataKeys`

If `EXAMPLE_CONFIG.printCredentialJson` is `true`, the script prints the full credential payload instead.

Example successful output:

```json
{
  "authenticated": true,
  "expiresAt": "2026-03-10T20:18:09.108Z",
  "trustProviderId": "aws-metadata-service"
}
{
  "credentialType": "ApiKey",
  "expiresAt": "2026-03-10T19:19:09.2559713Z",
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
- EC2 Client Workload matching
- `resourceSet`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `printCredentialJson` only for controlled testing.
