// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { EdgeClient, trustProviders } from "@aembit/edge-sdk"

/**
 * Minimal AWS Lambda example for the AWS Role Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the AWS Role Trust Provider
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 *
 * AWS Lambda usually sets `AWS_REGION` automatically. For local testing, set
 * either `AWS_REGION` or `AWS_DEFAULT_REGION` before running the bundled file.
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

// Use the built-in AWS Role Trust Provider so the SDK can identify the Lambda
// execution role by signing an AWS STS GetCallerIdentity request.
const trustProvider = trustProviders.awsRole({
  region: resolveAwsRegion()
})

const clientWorkloadDetails = resolveClientWorkloadDetails()

// Create the client once so warm Lambda invocations can reuse it.
const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  clientWorkloadDetails,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

export async function handler() {
  // 1) Ask Aembit for credentials for the target service. The SDK handles
  // authentication automatically and reuses cached tokens when possible.
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

  const baseResponse = {
    authenticated: true as const,
    trustProviderId: trustProvider.id,
    credentialType: credential.credentialType ?? null,
    credentialExpiresAt: credential.expiresAt ?? null
  }

  // 2) Return safe metadata by default. Enable full credential output only for
  // controlled testing when you explicitly want to inspect the credential data.
  if (EXAMPLE_CONFIG.printCredentialJson) {
    return {
      ...baseResponse,
      credential: {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        data: credential.data
      }
    }
  }

  return {
    ...baseResponse,
    dataKeys: Object.keys(credential.data)
  }
}

function resolveAwsRegion(): string {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
  if (!region) {
    throw new Error("Missing AWS region. Set AWS_REGION or AWS_DEFAULT_REGION.")
  }

  return region
}

function resolveClientWorkloadDetails() {
  const clientWorkloadId = process.env.CLIENT_WORKLOAD_ID?.trim()
  if (!clientWorkloadId) {
    return undefined
  }

  return {
    os: {
      environment: {
        CLIENT_WORKLOAD_ID: clientWorkloadId
      }
    }
  }
}
