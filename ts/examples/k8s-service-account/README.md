# Kubernetes Service Account Example

Runnable example demonstrating the TypeScript SDK with the Kubernetes Service Account Trust Provider.

This directory includes:

- `index.ts`: runnable TypeScript script demonstrating authentication and credential retrieval within a Kubernetes pod

## Prerequisites

- A Kubernetes cluster with service account token projection (standard in modern Kubernetes)
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload that matches your Kubernetes pod / service account identity
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- a Kubernetes Service Account Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Kubernetes Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/kubernetes-trust-provider/>
- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

## How Token Sourcing Works

In Kubernetes pods, service account tokens are mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`.

The script reads the projected token file automatically at runtime, or falls back to `AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN` when testing outside a cluster.

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
npm run build:example:k8s-service-account
```

This creates:

- `./examples/k8s-service-account/dist/index.mjs`

## Run The Example

### In A Kubernetes Pod

Execute the bundled script inside your container (or deploy it as a container command) where the service account token is projected:

```bash
node ./examples/k8s-service-account/dist/index.mjs
```

### Local Testing

To test locally outside Kubernetes, provide a service account token via the `AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN` environment variable and run from `ts/`:

```bash
AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN="<service-account-token>" npm run example:k8s-service-account
```

## Security Note

Never commit real credentials or production tokens to source control.
Always use projected service account tokens in Kubernetes pods.
