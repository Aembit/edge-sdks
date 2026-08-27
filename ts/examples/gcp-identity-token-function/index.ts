// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { createRequire } from "node:module"

import { EdgeClient } from "@aembit/edge-sdk"
import { createGcpIdentityTokenTrustProvider } from "@aembit/edge-sdk/trust-providers/gcp-identity-token"

const GCP_METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity"

/**
 * Minimal Google Cloud Run function example for the GCP Identity Token Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the GCP Identity Token Trust Provider
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 * - `gcpIdentityTokenAudience`: required by the GCP metadata server when minting
 *   the token. Use the Aembit identity host (`https://<tenant>.id.<region>.aembit.io`),
 *   not the Edge API host. Aembit policy matching for this flow is based on
 *   the token's `email` claim, not the audience value
 *
 * Token sourcing:
 * - production on GCP: fetch the identity token from the metadata server
 * - local development: set `GCP_IDENTITY_TOKEN` yourself when you need to
 *   exercise the SDK flow outside GCP
 */
const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "ApiKey",
  resourceSet: undefined as string | undefined,
  gcpIdentityTokenAudience: "https://<tenant>.id.<region>.aembit.io",
  printCredentialJson: false
}

// Use CommonJS loading for the Functions Framework package so the example can
// stay ESM while still matching Google's generated runtime pattern.
const require = createRequire(import.meta.url)

// Register the HTTP function with Google's Functions Framework.
// In Cloud Run functions, set the Function entry point to
// `aembitGcpIdentityToken` so incoming requests are routed here.
registerFunctionsFrameworkHandler()

// Create the Trust Provider and client once so warm function instances can
// reuse the SDK's in-memory auth cache while still resolving the metadata token
// lazily for each authentication flow.
const trustProvider = createGcpIdentityTokenTrustProvider({
  identityToken: () => resolveGcpIdentityToken()
})

const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

type HttpRequest = {
  method?: string
}

type HttpResponse = {
  status(code: number): HttpResponse
  set(field: string, value: string): HttpResponse
  json(body: unknown): void
  send(body: string): void
}

export async function aembitGcpIdentityToken(
  req: HttpRequest,
  res: HttpResponse
): Promise<void> {
  res.set("Cache-Control", "no-store")

  if (req.method && req.method !== "GET") {
    res.status(405).json({
      error: "Method Not Allowed"
    })
    return
  }

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

  if (EXAMPLE_CONFIG.printCredentialJson) {
    res.status(200).json({
      ...baseResponse,
      credential: {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        data: credential.data
      }
    })
    return
  }

  res.status(200).json({
    ...baseResponse,
    dataKeys: Object.keys(credential.data)
  })
}

async function resolveGcpIdentityToken(): Promise<string> {
  const envToken = process.env.GCP_IDENTITY_TOKEN?.trim()
  if (envToken) {
    return envToken
  }

  const metadataUrl = new URL(GCP_METADATA_IDENTITY_URL)
  metadataUrl.searchParams.set("audience", EXAMPLE_CONFIG.gcpIdentityTokenAudience)

  let response: Response

  try {
    response = await fetch(metadataUrl, {
      headers: {
        "Metadata-Flavor": "Google"
      }
    })
  } catch (error) {
    throw new Error(
      "GCP metadata server request for identity token failed",
      {
        cause: error
      }
    )
  }

  if (!response.ok) {
    throw new Error(
      `GCP metadata server returned ${String(response.status)} while fetching identity token`
    )
  }

  const identityToken = (await response.text()).trim()
  if (!identityToken) {
    throw new Error(
      "GCP metadata server returned an empty identity token"
    )
  }

  return identityToken
}

function registerFunctionsFrameworkHandler(): void {
  try {
    const functionsFramework = require("@google-cloud/functions-framework") as {
      http(name: string, handler: typeof aembitGcpIdentityToken): void
    }
    functionsFramework.http("aembitGcpIdentityToken", aembitGcpIdentityToken)
  } catch {
    // Keep the example typecheckable in this repository without forcing the
    // root TypeScript package to depend on the Functions Framework package.
  }
}
