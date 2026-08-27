// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { EdgeClient } from "@aembit/edge-sdk"
import { createOidcIdTokenTrustProvider } from "@aembit/edge-sdk/trust-providers/oidc-id-token"

/**
 * Minimal Vercel Function example for the OIDC ID Token Trust Provider.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the OIDC ID Token Trust Provider
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 *
 * Token sourcing:
 * - production on Vercel: `x-vercel-oidc-token` request header
 * - local development: `vercel env pull` writes `.env.local`, and Vercel
 *   loads `VERCEL_OIDC_TOKEN` from that file during `vercel dev`
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

export async function GET(request: Request) {
  // Build the Trust Provider and client inside the handler because the OIDC
  // token is request-scoped in production Vercel Functions.
  const trustProvider = createOidcIdTokenTrustProvider({
    identityToken: () => resolveOidcIdentityToken(request)
  })

  const client = new EdgeClient({
    baseUrl: EXAMPLE_CONFIG.baseUrl,
    clientId: EXAMPLE_CONFIG.clientId,
    trustProvider,
    resourceSet: EXAMPLE_CONFIG.resourceSet
  })

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
    return Response.json({
      ...baseResponse,
      credential: {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        data: credential.data
      }
    })
  }

  return Response.json({
    ...baseResponse,
    dataKeys: Object.keys(credential.data)
  })
}

function resolveOidcIdentityToken(request: Request): string {
  const headerToken = request.headers.get("x-vercel-oidc-token")?.trim()
  if (headerToken) {
    return headerToken
  }

  const envToken = process.env.VERCEL_OIDC_TOKEN?.trim()
  if (envToken) {
    return envToken
  }

  throw new Error(
    "Missing Vercel OIDC token. Use the x-vercel-oidc-token request header in production or set VERCEL_OIDC_TOKEN for local development."
  )
}
