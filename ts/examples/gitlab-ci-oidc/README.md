# GitLab CI OIDC Example

Runnable example demonstrating the TypeScript SDK with the GitLab Identity Token Trust Provider.

This directory includes:

- `index.ts`: runnable TypeScript script demonstrating authentication and credential retrieval in a GitLab CI job

## Prerequisites

- A GitLab CI/CD project with OIDC ID tokens configured in `.gitlab-ci.yml`
- An Aembit Access Policy configured for this SDK flow

## Aembit Access Policy (Required)

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload that matches your GitLab CI workload identity
- a Server Workload with a Service Endpoint (`host`, `port`) that the SDK request will target
- a GitLab Trust Provider with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- GitLab Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/gitlab-trust-provider/>
- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

## How Token Sourcing Works

In GitLab CI/CD pipelines, jobs can request OIDC tokens by configuring the `id_tokens` keyword in `.gitlab-ci.yml`:

```yaml
job_with_aembit:
  id_tokens:
    AEMBIT_GITLAB_OIDC_TOKEN:
      aud: "https://<tenant>.ec.<stack>.aembit.io"
  script:
    - node dist/index.mjs
```

The script inspects the `AEMBIT_GITLAB_OIDC_TOKEN` (or `GITLAB_OIDC_TOKEN`) environment variable injected by GitLab CI.

## Configure The Example

Edit [`index.ts`](./index.ts) and replace the placeholder values in `EXAMPLE_CONFIG`:

- `baseUrl`
- `clientId`
- `serverHost`
- `serverPort`
- `credentialType`
- `resourceSet` when needed
- `printCredentialJson` if you want the full credential payload printed

## Security Note

Never commit real credentials or production tokens to source control.
Always use environment variables or GitLab CI `id_tokens` in pipelines.
