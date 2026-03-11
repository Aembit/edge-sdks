# AWS IMDS EC2 Example

Runnable Node.js example for testing the TypeScript SDK on EC2 with AWS IMDSv2.

This directory includes:

- `index.mjs`: canonical integration example (main flow first, helper utilities below)

Run from `ts/`.

## Prerequisites

- Node.js `>=20`
- EC2 instance with IMDSv2 enabled and reachable at `169.254.169.254`
- Aembit Edge API base URL and client ID configured for AWS Metadata Service trust
- A target service host/port that matches your Aembit policy

## Configure Environment

Copy the example env file and fill in real values:

```bash
cp ./examples/aws-imds-ec2/.env.example ./examples/aws-imds-ec2/.env
```

Set `AEMBIT_EDGE_BASE_URL` to your tenant's regional Edge hostname by replacing both placeholders:

- `<tenant>`
- `<region>`

Reference: official Aembit Edge API docs: https://docs.aembit.io/api-guide/edge/

Required variables:

- `AEMBIT_EDGE_BASE_URL`
- `AEMBIT_CLIENT_ID`
- `AEMBIT_SERVER_HOST`
- `AEMBIT_SERVER_PORT`
- `AEMBIT_CREDENTIAL_TYPE`

Optional variables:

- `AEMBIT_RESOURCE_SET_ID`
- `AEMBIT_PRINT_CREDENTIAL_JSON` (`true`/`false`)
- `AEMBIT_IMDS_TIMEOUT_MS`
- `AEMBIT_IMDS_TOKEN_TTL_SECONDS`

## Run Example

Option 1 (with env file):

```bash
npm run build
npm run check:node:envfile
node --env-file=./examples/aws-imds-ec2/.env ./examples/aws-imds-ec2/index.mjs
```

`--env-file` requires Node `20.6+`.

With exported env vars:

```bash
npm run example:aws-imds
```

With `.env` file:

```bash
npm run example:aws-imds:envfile
```

## Copy `ts/` To A VM

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
