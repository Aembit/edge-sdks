// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { EdgeClient, TrustProviderError } from "@aembit/edge-sdk"
import { createTerraformCloudIdentityTokenTrustProvider } from "@aembit/edge-sdk/trust-providers/terraform-cloud-identity-token"

/**
 * Minimal Terraform Cloud / Terraform Enterprise example for the Terraform Cloud Identity Token Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the Terraform Cloud Trust Provider configuration
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 *
 * Token sourcing:
 * - Terraform Cloud dynamic provider credentials inject the workload identity token
 *   into the execution environment via `TFC_WORKLOAD_IDENTITY_TOKEN` (or custom configured env var).
 */
const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<stack>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "ApiKey",
  resourceSet: undefined as string | undefined,
  printCredentialJson: false
}

function resolveTerraformCloudIdentityToken(): string {
  const token =
    process.env.AEMBIT_TERRAFORM_OIDC_TOKEN?.trim() ||
    process.env.TFC_WORKLOAD_IDENTITY_TOKEN?.trim()

  if (token) {
    return token
  }

  throw new TrustProviderError(
    "Missing Terraform Cloud identity token. Ensure Dynamic Provider Credentials / Workload Identity is configured in your Terraform workspace or set AEMBIT_TERRAFORM_OIDC_TOKEN for local testing.",
    {
      retryable: false
    }
  )
}

// Build the Trust Provider using the resolved Terraform Cloud identity token
const trustProvider = createTerraformCloudIdentityTokenTrustProvider({
  identityToken: () => resolveTerraformCloudIdentityToken()
})

const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

async function main() {
  // 1) Authenticate the Terraform Cloud workload and print session info
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

  // 2) Request credentials for the target service
  const credential = await client.getCredential(
    {
      server: {
        host: EXAMPLE_CONFIG.serverHost,
        port: EXAMPLE_CONFIG.serverPort
      },
      credentialType: EXAMPLE_CONFIG.credentialType
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

main().catch((error: unknown) => {
  logStructuredError(error)
  process.exitCode = 1
})
