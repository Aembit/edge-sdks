import { TrustProviderError } from "../protocol/errors.js"
import { executeWithRetry } from "../protocol/retry.js"
import type { RetryPolicyOverride } from "../../types/retry.js"
import type {
  ClientWorkloadDetails,
  CollectedTrustProviderIdentity,
  TrustProvider
} from "../../types/trust-provider.js"

const DEFAULT_PROVIDER_ID = "gcp-identity-token"

type IdentityTokenSource = string | (() => string | Promise<string>)

/**
 * Options for the built-in GCP Identity Token Trust Provider.
 */
export interface GcpIdentityTokenTrustProviderOptions {
  /**
   * Stable provider id reported in auth session metadata.
   * Defaults to `"gcp-identity-token"`.
   */
  id?: string

  /**
   * GCP identity token or a lazy token source.
   *
   * Use a function when the token is request-scoped or must be fetched at call time.
   */
  identityToken: IdentityTokenSource

  /**
   * Retry override for GCP identity token collection.
   */
  retry?: RetryPolicyOverride
}

class GcpIdentityTokenTrustProvider implements TrustProvider {
  /**
   * Internal GCP Identity Token Trust Provider implementation.
   *
   * This provider resolves a caller-supplied GCP identity token source and
   * sends it as `client.gcp.identityToken` in `/edge/v1/auth` requests.
   */
  readonly id: string
  readonly kind = "gcp_identity_token" as const

  private readonly identityToken?: IdentityTokenSource
  private readonly retry?: RetryPolicyOverride

  constructor(options?: GcpIdentityTokenTrustProviderOptions) {
    this.id = resolveProviderId(options?.id)
    this.identityToken = options?.identityToken
    this.retry = options?.retry
  }

  getIdentitySingleFlightKey(): string | undefined {
    return typeof this.identityToken === "string" ? `${this.kind}:${this.id}` : undefined
  }

  /**
   * Collects GCP identity token data for `/edge/v1/auth`.
   *
   * Returns `client` payload content compatible with
   * `gcp.identityToken`.
   */
  async collectIdentity(): Promise<ClientWorkloadDetails> {
    const identity = await this.collectIdentityWithMetadata()
    return identity.client
  }

  async collectIdentityWithMetadata(): Promise<CollectedTrustProviderIdentity> {
    return executeWithRetry(
      async () => this.collectIdentityOnce(),
      {
        policy: this.retry,
        isRetryableError: (error) =>
          error instanceof TrustProviderError && error.retryable === true
      }
    )
  }

  private async collectIdentityOnce(): Promise<CollectedTrustProviderIdentity> {
    const identityToken = await resolveIdentityToken(this.identityToken)
    const authCacheKey = await buildAuthCacheKey(identityToken)

    return {
      client: {
        gcp: {
          identityToken
        }
      },
      authCacheKey
    }
  }
}

/**
 * Creates a Trust Provider that sends a GCP identity token as
 * `client.gcp.identityToken`.
 */
export function createGcpIdentityTokenTrustProvider(
  options: GcpIdentityTokenTrustProviderOptions
): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new GcpIdentityTokenTrustProvider(runtimeOptions)
}

function resolveProviderId(value: string | undefined): string {
  const id = typeof value === "string" ? value.trim() : ""
  return id.length > 0 ? id : DEFAULT_PROVIDER_ID
}

async function resolveIdentityToken(source: IdentityTokenSource | undefined): Promise<string> {
  if (typeof source === "undefined") {
    throw new TrustProviderError("GCP Identity Token Trust Provider requires configuration", {
      retryable: false
    })
  }

  try {
    const rawValue = typeof source === "function" ? await source() : source
    const identityToken = typeof rawValue === "string" ? rawValue.trim() : ""

    if (identityToken.length === 0) {
      throw new TrustProviderError(
        "GCP Identity Token Trust Provider requires a non-empty identity token",
        {
          retryable: false
        }
      )
    }

    return identityToken
  } catch (error) {
    if (error instanceof TrustProviderError) {
      throw error
    }

    throw new TrustProviderError(
      "GCP Identity Token Trust Provider failed to resolve the identity token",
      {
        retryable: true,
        cause: error
      }
    )
  }
}

async function buildAuthCacheKey(identityToken: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(identityToken))
  const bytes = new Uint8Array(digest)
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `gcp:${hex}`
}
