import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions"

import { EdgeClient } from "../../../../src/index.js"
import { TrustProviderError } from "../../../../src/internal/protocol/errors.js"
import { createOidcIdTokenTrustProvider } from "../../../../src/trust-providers/oidc-id-token.js"

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
 * - `entraAudience`: the Entra application ID URI used to mint the managed
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
  authLevel: "anonymous",
  handler: aembitAzureEntraOidc
})

// Create the Trust Provider and client once so warm function instances can
// reuse the SDK's in-memory auth cache while still resolving the Entra token
// lazily for each authentication flow.
const trustProvider = createOidcIdTokenTrustProvider({
  identityToken: () => resolveAzureEntraToken()
})

const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet
})

export async function aembitAzureEntraOidc(
  request: HttpRequest
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

async function resolveAzureEntraToken(): Promise<string> {
  const envToken = process.env.AZURE_ENTRA_ACCESS_TOKEN?.trim()
  if (envToken) {
    return envToken
  }

  const scope = normalizeEntraScope(EXAMPLE_CONFIG.entraAudience)
  const managedIdentityCredential = await createManagedIdentityCredential()

  let accessToken: { token: string } | null

  try {
    accessToken = await managedIdentityCredential.getToken(scope)
  } catch (error) {
    throw new TrustProviderError(
      "Azure managed identity token request failed",
      {
        retryable: true,
        cause: error
      }
    )
  }

  const token = accessToken?.token?.trim()
  if (!token) {
    throw new TrustProviderError(
      "Azure managed identity returned an empty Entra access token",
      {
        retryable: false
      }
    )
  }

  return token
}

function normalizeEntraScope(audience: string): string {
  const trimmedAudience = audience.trim()
  if (!trimmedAudience) {
    throw new TrustProviderError(
      "Azure Functions example requires EXAMPLE_CONFIG.entraAudience",
      {
        retryable: false
      }
    )
  }

  return trimmedAudience.endsWith("/.default") ? trimmedAudience : `${trimmedAudience}/.default`
}

async function createManagedIdentityCredential(): Promise<{
  getToken(scope: string | string[]): Promise<{ token: string } | null>
}> {
  let azureIdentity: typeof import("@azure/identity")

  try {
    azureIdentity = await import("@azure/identity")
  } catch (error) {
    throw new TrustProviderError(
      "Azure managed identity libraries are unavailable. Set AZURE_ENTRA_ACCESS_TOKEN for local testing or install the example's Azure dependencies.",
      {
        retryable: false,
        cause: error
      }
    )
  }

  return new azureIdentity.ManagedIdentityCredential(EXAMPLE_CONFIG.managedIdentityClientId)
}
