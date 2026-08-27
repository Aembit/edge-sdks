// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext
} from "@azure/functions"

import { EdgeClient } from "@aembit/edge-sdk"
import { createOidcIdTokenTrustProvider } from "@aembit/edge-sdk/trust-providers/oidc-id-token"

/**
 * Minimal Azure Functions example for Azure managed identity + the Aembit OIDC
 * Trust Provider flow.
 *
 * What to edit:
 * - `baseUrl`: your tenant's regional Aembit Edge URL
 * - `clientId`: your Edge SDK Client ID from the Aembit OIDC Trust Provider
 * - `serverHost` / `serverPort`: the Service Endpoint from your Server Workload
 * - `credentialType`: the credential type returned by your Credential Provider
 * - `resourceSet`: optional, only when your tenant flow requires it
 * - `entraAudience`: the Entra Application ID URI used to mint the managed
 *   identity token for Aembit attestation
 * - `managedIdentityClientId`: optional, only when you use a user-assigned
 *   managed identity instead of the default system-assigned identity
 *
 * Token sourcing:
 * - production on Azure Functions: ManagedIdentityCredential
 * - local development: set `AZURE_ENTRA_ACCESS_TOKEN` yourself when you need
 *   to exercise the SDK flow outside Azure
 */
const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "ApiKey",
  resourceSet: undefined as string | undefined,
  entraAudience: "api://your-aembit-tenant-app-id-uri",
  managedIdentityClientId: undefined as string | undefined,
  printCredentialJson: false
}

// Register the Azure Functions HTTP entry point at module load.
app.http("aembitAzureEntraOidc", {
  methods: ["GET"],
  authLevel: "function",
  handler: aembitAzureEntraOidc
})

// Handle the HTTP request by authenticating with Edge and returning a small
// summary of the credential response.
export async function aembitAzureEntraOidc(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method && request.method !== "GET") {
    return {
      status: 405,
      headers: {
        "Cache-Control": "no-store"
      },
      jsonBody: {
        error: "Method Not Allowed"
      }
    }
  }

  const trustProvider = createTrustProvider(context)
  const client = createClient(trustProvider)

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
    return {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      },
      jsonBody: {
        ...baseResponse,
        credential: {
          credentialType: credential.credentialType ?? null,
          expiresAt: credential.expiresAt ?? null,
          data: credential.data
        }
      }
    }
  }

  return {
    status: 200,
    headers: {
      "Cache-Control": "no-store"
    },
    jsonBody: {
      ...baseResponse,
      dataKeys: Object.keys(credential.data)
    }
  }
}

// Create a Trust Provider for this invocation so token-resolution logs can use
// the current Azure Functions invocation context.
function createTrustProvider(context: InvocationContext) {
  return createOidcIdTokenTrustProvider({
    identityToken: () => resolveAzureEntraToken(context)
  })
}

// Build an Edge client using the example's static configuration and the
// invocation-scoped Trust Provider.
function createClient(trustProvider: ReturnType<typeof createOidcIdTokenTrustProvider>) {
  return new EdgeClient({
    baseUrl: EXAMPLE_CONFIG.baseUrl,
    clientId: EXAMPLE_CONFIG.clientId,
    trustProvider,
    resourceSet: EXAMPLE_CONFIG.resourceSet
  })
}

// Resolve the Entra token from either local environment override or Azure
// managed identity, with Azure Functions logs at each step.
async function resolveAzureEntraToken(context: InvocationContext): Promise<string> {
  const envToken = process.env.AZURE_ENTRA_ACCESS_TOKEN?.trim()
  if (envToken) {
    context.log("Using AZURE_ENTRA_ACCESS_TOKEN from environment")
    return envToken
  }

  const scope = normalizeEntraScope(EXAMPLE_CONFIG.entraAudience)
  context.log(`Requesting managed identity token for scope ${scope}`)
  const managedIdentityCredential = await createManagedIdentityCredential()

  let accessToken: { token: string } | null

  try {
    accessToken = await managedIdentityCredential.getToken(scope)
  } catch (error) {
    context.error("Azure managed identity token request failed", error)
    throw new Error(
      "Azure managed identity token request failed",
      {
        cause: error
      }
    )
  }

  const token = accessToken?.token?.trim()
  if (!token) {
    context.error("Azure managed identity returned an empty Entra access token")
    throw new Error(
      "Azure managed identity returned an empty Entra access token"
    )
  }

  context.log("Azure managed identity token request succeeded")
  return token
}

// Convert the configured Entra audience into the scope string expected by
// ManagedIdentityCredential.
function normalizeEntraScope(audience: string): string {
  const trimmedAudience = audience.trim()
  const normalizedAudience = trimmedAudience.replace(/\/+$/, "")

  if (!normalizedAudience) {
    throw new Error(
      "Azure Functions example requires EXAMPLE_CONFIG.entraAudience"
    )
  }

  return normalizedAudience.endsWith("/.default")
    ? normalizedAudience
    : `${normalizedAudience}/.default`
}

// Lazily load Azure Identity so local workflows can still run with an injected
// environment token even if Azure packages are unavailable.
async function createManagedIdentityCredential(): Promise<{
  getToken(scope: string | string[]): Promise<{ token: string } | null>
}> {
  let azureIdentity: typeof import("@azure/identity")

  try {
    azureIdentity = await import("@azure/identity")
  } catch (error) {
    throw new Error(
      "Azure managed identity libraries are unavailable. Set AZURE_ENTRA_ACCESS_TOKEN for local testing or install the example's Azure dependencies.",
      {
        cause: error
      }
    )
  }

  return new azureIdentity.ManagedIdentityCredential(EXAMPLE_CONFIG.managedIdentityClientId)
}
