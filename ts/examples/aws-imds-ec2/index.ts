// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { EdgeClient } from "@aembit/edge-sdk"
import { createAwsMetadataServiceTrustProvider } from "@aembit/edge-sdk/trust-providers/aws-metadata-service"

/**
 * Minimal EC2 example for the AWS Metadata Service Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the AWS Metadata Service Trust Provider
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 *
 * Build this example into a single `index.mjs`, copy that file to an EC2
 * instance with IMDSv2 enabled, then run `node index.mjs`.
 */
const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "ApiKey",
  resourceSet: undefined as string | undefined,
  printCredentialJson: false
}

// Use the built-in AWS Metadata Service Trust Provider so the SDK can
// identify the EC2 instance through AWS IMDSv2.
const trustProvider = createAwsMetadataServiceTrustProvider()

// Create the client once because this example is a simple one-shot script.
const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

async function main() {
  // 1) Authenticate the current EC2 workload and print a safe session summary.
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

  // 2) Ask Aembit for credentials for the target service.
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
  console.log("Set EXAMPLE_CONFIG.printCredentialJson = true to print full credential data.")
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
