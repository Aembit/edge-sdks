# AWS IMDS EC2 Example

Runnable Node.js example for testing the TypeScript SDK on EC2 with AWS IMDSv2.

This directory includes:

- `index.mjs`: integration example

Run from `ts/`.

## Prerequisites

- EC2 instance with IMDSv2 enabled and reachable at `169.254.169.254`
- Node.js `>=20` installed on the instance
- An Aembit Access Policy configured for this SDK flow

### Aembit Access Policy (Required)

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload for the EC2 instance identity
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- an AWS Metadata Service Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested `AEMBIT_CREDENTIAL_TYPE`

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- AWS Metadata Service Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/aws-metadata-service-trust-provider/>
- AWS Metadata Service auth setup: <https://docs.aembit.io/api-guide/edge/auth/aws-metadata-service>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration (for this README examples):

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443` (TLS selected)
- Forward to Port: `443` (TLS selected; not used by SDK flow)
- Authentication Method: `No Authentication` (not used by SDK flow)

## Configure Environment

Copy the example env file and fill in real values:

```bash
cp ./examples/aws-imds-ec2/.env.example ./examples/aws-imds-ec2/.env
```

Set `AEMBIT_EDGE_BASE_URL` to your tenant's regional Edge hostname by replacing both placeholders:

- `<tenant>`
- `<region>`

Reference: official Aembit Edge API docs: <https://docs.aembit.io/api-guide/edge/>

Required variables:

- `AEMBIT_EDGE_BASE_URL`
- `AEMBIT_CLIENT_ID`
- `AEMBIT_SERVER_HOST`
- `AEMBIT_SERVER_PORT`
- `AEMBIT_CREDENTIAL_TYPE`

`AEMBIT_SERVER_HOST` and `AEMBIT_SERVER_PORT` must match the Service Endpoint values configured in your Access Policy's Server Workload.

Optional variables:

- `AEMBIT_RESOURCE_SET_ID`
- `AEMBIT_PRINT_CREDENTIAL_JSON` (`true`/`false`)
- `AEMBIT_IMDS_TIMEOUT_MS`
- `AEMBIT_IMDS_TOKEN_TTL_SECONDS`

## Run Example

Run these commands from `ts/`.

Path A (recommended): use `.env` directly.

```bash
npm run example:aws-imds:envfile
```

`--env-file` requires Node `20.6+`.

Path B: export variables manually, then run.

```bash
export AEMBIT_EDGE_BASE_URL=https://<tenant>.ec.<region>.aembit.io
export AEMBIT_CLIENT_ID=your-edge-sdk-client-id
export AEMBIT_SERVER_HOST=target.example.com
export AEMBIT_SERVER_PORT=443
export AEMBIT_CREDENTIAL_TYPE=ApiKey

# Optional:
# export AEMBIT_RESOURCE_SET_ID=your-resource-set-id
# export AEMBIT_PRINT_CREDENTIAL_JSON=true
# export AEMBIT_IMDS_TIMEOUT_MS=1000
# export AEMBIT_IMDS_TOKEN_TTL_SECONDS=21600

npm run example:aws-imds
```

This path works on Node `>=20` and does not depend on `--env-file`.

## Copy `ts/` to a Remote VM

From the repository root, use:

```bash
./scripts/deploy-ts-to-vm.sh \
  --host ec2-xx-xx-xx-xx.compute.amazonaws.com \
  --user ubuntu \
  --key ~/.ssh/your-key.pem \
  --remote-dir ~/edge-sdks/ts
```

This is useful for EC2 testing of runnable examples and excludes `node_modules`, `dist`, `.env*`, and `.DS_Store`.
It keeps local `ts/node_modules` and `ts/dist` by default; pass `--clean-local` (or set `DEPLOY_CLEAN_LOCAL=1`) only when you explicitly want local cleanup.
Because `.env*` is excluded, local example env files are not uploaded to the remote VM.

`DEPLOY_*` variables configure the local deploy script only.
`AEMBIT_*` variables are runtime inputs for the example on the remote VM.

Using a config file:

```bash
cp ./scripts/deploy-ts-to-vm.env.example ./scripts/deploy-ts-to-vm.env
./scripts/deploy-ts-to-vm.sh --config ./scripts/deploy-ts-to-vm.env
```

Using environment variables:

```bash
export DEPLOY_HOST=ec2-xx-xx-xx-xx.compute.amazonaws.com
export DEPLOY_USER=ubuntu
export DEPLOY_REMOTE_DIR=~/edge-sdks/ts
./scripts/deploy-ts-to-vm.sh
```

After copy, run on the remote VM:

```bash
cd ~/edge-sdks/ts
npm install
npm run build
cp ./examples/aws-imds-ec2/.env.example ./examples/aws-imds-ec2/.env
```

Validate required env entries before running:

```bash
grep '^AEMBIT_' ./examples/aws-imds-ec2/.env
```

## Output

The script prints credential metadata and `dataKeys` by default.

Set `AEMBIT_PRINT_CREDENTIAL_JSON=true` to print full credential data.

Example successful output:

```text
Authenticated session: {
  authenticated: true,
  expiresAt: '2026-03-10T20:18:09.108Z',
  trustProviderId: 'aws-metadata-service'
}
{
  "credentialType": "ApiKey",
  "expiresAt": "2026-03-10T19:19:09.2559713Z",
  "data": {
    "apiKey": "sekretk3y!"
  }
}
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If `authenticate()` succeeds but credential retrieval returns `401`, verify that `AEMBIT_EDGE_BASE_URL` is the final regional Edge host (no redirect).

Example:

- redirected host pattern: `https://<tenant>.ec.<region>.aembit.io`

Using a base URL that redirects to another host can cause `Authorization` to be dropped on redirect, resulting in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `data`

This indicates that the request reached Edge, but did not match the expected access policy/service request shape.

Verify:

- `AEMBIT_SERVER_HOST` and `AEMBIT_SERVER_PORT`
- `AEMBIT_CREDENTIAL_TYPE` value for the target provider
- workload identity mapping for the EC2 instance
- resource set selection (`AEMBIT_RESOURCE_SET_ID` or tenant default)

## Security Note

Do not use real secrets in shared logs or screenshots.
Use `AEMBIT_PRINT_CREDENTIAL_JSON=true` only for controlled testing.
