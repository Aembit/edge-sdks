# Aembit Edge TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@aembit/edge-sdk.svg)](https://www.npmjs.com/package/@aembit/edge-sdk)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/Aembit/edge-sdks/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

Official TypeScript / JavaScript SDK for interacting with the [Aembit Edge API](https://docs.aembit.io/api-guide/edge/).

The Aembit Edge SDK enables workloads, serverless functions, AI agents, and MCP servers to authenticate and retrieve credentials dynamically without managing static secrets.

## Features

- 🔐 **Zero Hardcoded Secrets**: Authenticate via workload identity (AWS IMDSv2, AWS STS Role, GCP Identity Token, GitHub Actions OIDC, Generic OIDC).
- 🔄 **Automatic Token Lifecycle**: Built-in in-memory bearer token caching and proactive background refresh.
- ⚡ **Tree-Shakeable Subpath Imports**: Optimize bundle sizes by importing only the trust providers you need.
- 🪵 **Structured Logging**: Pluggable `AembitLogger` interface compatible with Winston, Pino, or standard console.
- 📦 **Modern ESM & TypeScript**: Strict type safety targeting Node.js `>=20`.

## Installation

```bash
npm install @aembit/edge-sdk
```

## Quickstart

```typescript
import { EdgeClient, trustProviders } from "@aembit/edge-sdk"

// 1. Initialize the client with your Aembit tenant and Trust Provider
const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsMetadataService(),
})

// 2. Retrieve credentials for your target server
const credential = await client.getCredential({
  server: {
    host: "db.internal",
    port: 5432,
  },
})

console.log("Retrieved credential data:", credential.data)
```

## Supported Trust Providers

| Trust Provider | Factory Method | Subpath Import |
| :--- | :--- | :--- |
| **AWS IMDSv2 (EC2)** | `trustProviders.awsMetadataService()` | `@aembit/edge-sdk/trust-providers/aws-metadata-service` |
| **AWS IAM Role (Lambda/ECS)** | `trustProviders.awsRole({ region: "us-east-1" })` | `@aembit/edge-sdk/trust-providers/aws-role` |
| **GCP Identity Token** | `trustProviders.gcpIdentityToken({ identityToken })` | `@aembit/edge-sdk/trust-providers/gcp-identity-token` |
| **GitHub Actions OIDC** | `trustProviders.githubIdentityToken({ identityToken })` | `@aembit/edge-sdk/trust-providers/github-identity-token` |
| **GitLab CI/CD OIDC** | `trustProviders.gitlabIdentityToken({ identityToken })` | `@aembit/edge-sdk/trust-providers/gitlab-identity-token` |
| **Kubernetes Service Account** | `trustProviders.k8sServiceAccount({ serviceAccountToken })` | `@aembit/edge-sdk/trust-providers/k8s-service-account` |
| **Terraform Cloud OIDC** | `trustProviders.terraformCloudIdentityToken({ identityToken })` | `@aembit/edge-sdk/trust-providers/terraform-cloud-identity-token` |
| **Generic OIDC Token** | `trustProviders.oidcIdToken({ identityToken })` | `@aembit/edge-sdk/trust-providers/oidc-id-token` |

### Provider Usage Examples

#### AWS IAM Role (STS)

```typescript
import { EdgeClient, trustProviders } from "@aembit/edge-sdk"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsRole({ region: "us-east-1" }),
})
```

#### GitHub Actions / OIDC Identity Tokens

```typescript
import { EdgeClient, trustProviders } from "@aembit/edge-sdk"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.githubIdentityToken({
    identityToken: "YOUR_GITHUB_OIDC_TOKEN", // Or a dynamic resolver function: () => fetchOidcToken()
  }),
})
```

#### Google Cloud (GCP Identity Token)

```typescript
import { EdgeClient, trustProviders } from "@aembit/edge-sdk"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.gcpIdentityToken({
    identityToken: "YOUR_GCP_ID_TOKEN",
  }),
})
```

### Customizing Provider IDs (Multi-Identity & Observability)

All Trust Provider options accept an optional `id` parameter. This identifier is attached to structured logs (`trustProviderId`) and returned in `AuthSession` metadata when calling `client.authenticate()`.

By default, providers use standard identifiers (e.g., `"gitlab-identity-token"`, `"terraform-cloud-identity-token"`). You can customize `id` when:

- Running multiple client workloads or pipeline stages in the same application.
- Correlating authentication events with internal APM, Datadog, or OpenTelemetry service registries.

```typescript
const trustProvider = trustProviders.terraformCloudIdentityToken({
  id: "tfc-prod-workspace",
  identityToken: process.env.TFC_WORKLOAD_IDENTITY_TOKEN!,
})
```

### Optimizing Bundle Size (Subpath Imports)

When bundling for serverless functions (AWS Lambda, Cloudflare Workers, Vercel) where bundle size is critical, import individual provider factories via subpaths:

```typescript
import { EdgeClient } from "@aembit/edge-sdk"
import { createAwsRoleTrustProvider } from "@aembit/edge-sdk/trust-providers/aws-role"

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: createAwsRoleTrustProvider({ region: "us-east-1" }),
})
```

## Logging & Observability

By default, the SDK remains completely silent and outputs nothing to the console. To capture internal operational events (token caching, request lifecycles, and errors), supply an optional `logger` implementing `AembitLogger`:

```typescript
import { EdgeClient, trustProviders, type AembitLogger } from "@aembit/edge-sdk"

// Adapt any logger (e.g. Winston, Pino, or standard console)
const logger: AembitLogger = {
  debug: (message, context) => console.debug(`[DEBUG] ${message}`, context ?? ""),
  info: (message, context) => console.info(`[INFO] ${message}`, context ?? ""),
  warn: (message, context) => console.warn(`[WARN] ${message}`, context ?? ""),
  error: (message, context) => console.error(`[ERROR] ${message}`, context ?? ""),
}

const client = new EdgeClient({
  baseUrl: "https://tenant.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsMetadataService(),
  logger,
})
```

## Examples

Runnable end-to-end examples are available in the GitHub repository:

- [AWS EC2 + IMDSv2](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/aws-imds-ec2)
- [AWS Lambda + IAM Role](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/aws-role-lambda)
- [Azure Functions + Entra ID OIDC](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/azure-function-entra-oidc)
- [GitLab CI + OIDC](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/gitlab-ci-oidc)
- [Google Cloud Functions + GCP Identity Token](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/gcp-identity-token-function)
- [Kubernetes Service Account](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/k8s-service-account)
- [Terraform Cloud + OIDC](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/terraform-cloud-oidc)
- [Vercel Functions + OIDC](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/oidc-vercel-function)
- [Winston & Pino Logging Integration](https://github.com/Aembit/edge-sdks/tree/main/ts/examples/logging_integration)

## Documentation & Resources

- [Official Aembit Edge API Guide](https://docs.aembit.io/api-guide/edge/)
- [Aembit Documentation](https://docs.aembit.io/)
- [GitHub Issue Tracker](https://github.com/Aembit/edge-sdks/issues)
- [Contributing Guide](https://github.com/Aembit/edge-sdks/blob/main/CONTRIBUTING.md)

## License

This project is licensed under the [Apache-2.0 License](https://github.com/Aembit/edge-sdks/blob/main/LICENSE).
