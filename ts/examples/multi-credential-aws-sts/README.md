# Multi-Credential Provider (Multi-CP) AWS STS Federation Example

Runnable example demonstrating the TypeScript SDK with a Multi-Credential Provider Access Policy and AWS STS Federation multi-credential selection using `connectionMetadata.accessKeyId`.

This directory includes:

- `index.ts`: runnable TypeScript script demonstrating authentication and credential retrieval with multi-credential selection

## Multi-Credential Provider Access Policy (Required)

This example requires an Aembit Access Policy configured with **multiple AWS STS Federation Credential Providers**.

In complex environments, workloads often need to access different AWS services or assume different IAM roles (for example, one role for Amazon S3 access and another role for Amazon DynamoDB access). Rather than requiring separate Access Policies or multiple workload identities, Aembit allows attaching multiple Credential Providers to a single Access Policy.

In a Multi-CP configuration for AWS STS Federation:

1. Each AWS STS Federation Credential Provider configured in the Access Policy is assigned a unique placeholder **Access Key ID** selector (for example, `AKIADUMMYFORROLEA` for S3 access, and `AKIADUMMYFORROLEB` for DynamoDB access).
2. When the application requests credentials via the Edge SDK, it specifies the target role by passing the selector in `connectionMetadata.accessKeyId`:

```typescript
const credential = await client.getCredential({
  server: {
    host: "target.example.com",
    port: 443
  },
  credentialType: "AwsStsFederation",
  connectionMetadata: {
    accessKeyId: "AKIADUMMYFORROLEA"
  }
})
```

Aembit uses the `accessKeyId` selector to identify the matching AWS STS Federation Credential Provider, assumes the associated IAM role, and returns temporary AWS credentials (`awsAccessKeyId`, `awsSecretAccessKey`, `awsSessionToken`).

> **Note:** This example uses the Kubernetes Service Account Trust Provider to authenticate the workload, but the multi-CP selector mechanism works identically with any Trust Provider.

## Prerequisites

- A Kubernetes cluster with a mounted Service Account token, or an environment variable `AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN` for local testing
- An Aembit Access Policy with multiple AWS STS Federation Credential Providers configured

## Configure The Example

Edit [`index.ts`](./index.ts) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`: your tenant's regional Aembit Edge URL
- `clientId`: your Edge SDK Client ID from the Trust Provider configuration
- `serverHost` and `serverPort`: the Service Endpoint from your Server Workload (e.g. `target.example.com:443` or an AWS service endpoint)
- `credentialType`: `"AwsStsFederation"`
- `accessKeyIdSelector`: your target AWS STS Federation Credential Provider Access Key ID selector (e.g. `AKIADUMMYFORROLEA`)
- `resourceSet`: optional, only when your tenant flow requires it
- `printCredentialJson`: set to `true` if you want the full credential payload printed

## Build The Bundle

Run from `ts/`:

```bash
npm run build:example:multi-credential-aws-sts
```

This creates:

- `./examples/multi-credential-aws-sts/dist/index.mjs`

## Run The Example

### In Kubernetes

Execute the bundled script inside your container where the service account token is mounted:

```bash
node ./examples/multi-credential-aws-sts/dist/index.mjs
```

### Local Testing

To test locally outside a Kubernetes Pod, provide a mock or valid service account token via the `AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN` environment variable and run from `ts/`:

```bash
AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN="<token>" npm run example:multi-credential-aws-sts
```

## Security Note

Never commit real credentials or production tokens to source control.
Always use environment variables or Kubernetes projected tokens in workloads.
