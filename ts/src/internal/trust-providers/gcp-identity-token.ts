import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "gcp-identity-token"

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

const GcpIdentityTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "gcp_identity_token",
  subjectKey: "gcp",
  authCacheKeyPrefix: "gcp",
  errorLabel: "GCP Identity Token Trust Provider"
})

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
