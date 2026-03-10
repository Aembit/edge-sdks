# AWS IMDS EC2 Example

Runnable Node.js example for testing the TypeScript SDK on EC2 with AWS IMDSv2.

This directory includes:

- `index.mjs`: canonical integration example (main flow first, helper utilities below)

Run from `ts/`.

## Prerequisites

- Node.js `>=20`
- EC2 instance with IMDSv2 enabled and reachable at `169.254.169.254`
- Aembit Edge base URL and client ID configured for AWS Metadata Service trust
- A target service host/port that matches your Aembit policy

## Configure Environment

Copy the example env file and fill in real values:

```bash
cp ./examples/aws-imds-ec2/.env.example ./examples/aws-imds-ec2/.env
```

Required variables:

- `AEMBIT_EDGE_BASE_URL`
- `AEMBIT_CLIENT_ID`
- `AEMBIT_SERVER_HOST`
- `AEMBIT_SERVER_PORT`
- `AEMBIT_CREDENTIAL_TYPE`

Optional variables:

- `AEMBIT_RESOURCE_SET`
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

## Output

The script prints credential metadata and `dataKeys` by default.

Set `AEMBIT_PRINT_CREDENTIAL_JSON=true` to print full credential data.
