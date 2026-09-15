// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
/**
 * Example: Multi-Credential Provider (Multi-CP) Selection with AWS STS Federation
 *
 * This example requires an Aembit Access Policy configured with MULTIPLE Credential Providers
 * (specifically, multiple AWS STS Federation Credential Providers).
 *
 * In a Multi-CP Access Policy, each AWS STS Federation Credential Provider is configured with a unique
 * placeholder "Access Key ID" selector (for example, `AKIADUMMYFORROLEA` for S3 access, and
 * `AKIADUMMYFORROLEB` for DynamoDB access).
 *
 * When requesting credentials, the SDK passes `connectionMetadata: { accessKeyId: "..." }`
 * to select which Credential Provider Aembit should use. Aembit matches the selector,
 * assumes the corresponding IAM role, and returns temporary AWS credentials
 * (accessKeyId, secretAccessKey, sessionToken).
 *
 * Note: This example uses the Kubernetes Service Account Trust Provider to authenticate the
 * workload, but the multi-CP selector mechanism works with any Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the Kubernetes Service Account Trust Provider configuration
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload (e.g. target.example.com:443 or an AWS service endpoint)
 * - `credentialType`: "AwsStsFederation"
 * - `accessKeyIdSelector`: placeholder Access Key ID identifying the specific AWS STS Federation Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 */
import * as fs from "node:fs/promises"
import { EdgeClient, TrustProviderError } from "@aembit/edge-sdk"
import { createK8sServiceAccountTrustProvider } from "@aembit/edge-sdk/trust-providers/k8s-service-account"

const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<stack>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "AwsStsFederation",
  accessKeyIdSelector: "AKIADUMMYFORROLEA",
  resourceSet: undefined as string | undefined,
  tokenFilePath:
    process.env.K8S_TOKEN_PATH ||
    "/var/run/secrets/kubernetes.io/serviceaccount/token",
  printCredentialJson: false
}

async function resolveKubernetesServiceAccountToken(): Promise<string> {
  // 1) Allow explicit environment variable override for testing
  const envToken =
    process.env.AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN?.trim() ||
    process.env.K8S_SERVICE_ACCOUNT_TOKEN?.trim()

  if (envToken) {
    return envToken
  }

  // 2) Read the standard projected Kubernetes service account token file
  try {
    const fileToken = (await fs.readFile(EXAMPLE_CONFIG.tokenFilePath, "utf8")).trim()
    if (fileToken.length > 0) {
      return fileToken
    }
  } catch (error) {
    throw new TrustProviderError(
      `Failed to read Kubernetes service account token from '${EXAMPLE_CONFIG.tokenFilePath}'. ` +
        "Ensure the pod has a mounted service account token or set AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN for testing.",
      {
        retryable: false,
        cause: error
      }
    )
  }

  throw new TrustProviderError(
    `Kubernetes service account token file '${EXAMPLE_CONFIG.tokenFilePath}' was empty.`,
    {
      retryable: false
    }
  )
}

// Build the Trust Provider using the resolved Kubernetes Service Account token
const trustProvider = createK8sServiceAccountTrustProvider({
  serviceAccountToken: () => resolveKubernetesServiceAccountToken()
})

const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

async function main() {
  // 1) Authenticate the workload and print session info
  const session = await client.authenticate()
  console.log(
    JSON.stringify(
      {
        authenticated: session.authenticated,
        expiresAt: session.expiresAt,
        trustProviderId: session.trustProviderId
      },
      null,
      2
    )
  )

  // 2) Request credentials for the target AWS service using accessKeyId multi-credential selector
  const credential = await client.getCredential(
    {
      server: {
        host: EXAMPLE_CONFIG.serverHost,
        port: EXAMPLE_CONFIG.serverPort
      },
      credentialType: EXAMPLE_CONFIG.credentialType,
      connectionMetadata: {
        accessKeyId: EXAMPLE_CONFIG.accessKeyIdSelector
      }
    },
    {
      resourceSet: EXAMPLE_CONFIG.resourceSet
    }
  )

  if (EXAMPLE_CONFIG.printCredentialJson) {
    console.log(
      JSON.stringify(
        {
          credentialType: credential.credentialType ?? null,
          expiresAt: credential.expiresAt ?? null,
          data: credential.data
        },
        null,
        2
      )
    )
    return
  }

  console.log(
    JSON.stringify(
      {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        dataKeys: Object.keys(credential.data)
      },
      null,
      2
    )
  )
}

function logStructuredError(error: unknown) {
  if (!error || typeof error !== "object") {
    console.error("Unexpected error:", error)
    return
  }

  if (!("kind" in error)) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(message)
    return
  }

  const sdkError = error as {
    kind?: unknown
    message?: unknown
    retryable?: unknown
    statusCode?: unknown
    apiCode?: unknown
    requestId?: unknown
  }

  console.error("SDK request failed:")
  console.error(
    JSON.stringify(
      {
        kind: sdkError.kind,
        message: sdkError.message,
        retryable: sdkError.retryable,
        statusCode: sdkError.statusCode,
        apiCode: sdkError.apiCode,
        requestId: sdkError.requestId
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  logStructuredError(error)
  process.exit(1)
})
