# Terraform Cloud / Enterprise OIDC Example

Runnable example demonstrating the TypeScript SDK with the Terraform Cloud Identity Token Trust Provider.

This directory includes:

- `index.ts`: runnable TypeScript script demonstrating authentication and credential retrieval within a Terraform Cloud run or workflow

## Prerequisites

- A Terraform Cloud / Terraform Enterprise organization and workspace with Workload Identity (Dynamic Provider Credentials) enabled
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload that matches your Terraform Cloud workspace identity
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- a Terraform Cloud Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Terraform Cloud Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/terraform-cloud-trust-provider/>
- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

## How Token Sourcing Works

In Terraform Cloud runs, workload identity tokens are injected into the run environment via the `TFC_WORKLOAD_IDENTITY_TOKEN` environment variable (or a workspace-defined variable).

The script checks `AEMBIT_TERRAFORM_OIDC_TOKEN` and `TFC_WORKLOAD_IDENTITY_TOKEN`.

## Configure The Example

Edit [`index.ts`](./index.ts) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `printCredentialJson` if you want the full credential payload printed

## Build The Bundle

Run from `ts/`:

```bash
npm run build:example:terraform-cloud-oidc
```

This creates:

- `./examples/terraform-cloud-oidc/dist/index.mjs`

## Run The Example

### In Terraform Cloud / Enterprise Runs

Execute the bundled script during a run where Dynamic Provider Credentials / Workload Identity are configured:

```bash
node ./examples/terraform-cloud-oidc/dist/index.mjs
```

### Local Testing

To test locally outside Terraform Cloud, provide a workload identity token via the `AEMBIT_TERRAFORM_OIDC_TOKEN` environment variable and run from `ts/`:

```bash
AEMBIT_TERRAFORM_OIDC_TOKEN="<tfc-oidc-token>" npm run example:terraform-cloud-oidc
```

## Security Note

Never commit real credentials or production tokens to source control.
Always use environment variables or Terraform Cloud Dynamic Provider Credentials in workspaces.
