// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "oidc-id-token"

/**
 * Options for the built-in OIDC ID Token Trust Provider.
 */
export interface OidcIdTokenTrustProviderOptions {
  /**
   * Optional custom identifier for this Trust Provider instance used in structured logging and session metadata.
   * Defaults to `"oidc-id-token"`.
   */
  id?: string

  /**
   * OIDC identity token or a lazy token source.
   *
   * Use a function when the token is request-scoped or must be fetched at call time.
   */
  identityToken: IdentityTokenSource

  /**
   * Retry override for OIDC identity token collection.
   */
  retry?: RetryPolicyOverride
}

const OidcIdTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "oidc_id_token",
  subjectKey: "oidc",
  authCacheKeyPrefix: "oidc",
  errorLabel: "OIDC ID Token Trust Provider"
})

/**
 * Creates a Trust Provider that sends an OIDC ID token as
 * `client.oidc.identityToken`.
 */
export function createOidcIdTokenTrustProvider(
  options: OidcIdTokenTrustProviderOptions
): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new OidcIdTokenTrustProvider(runtimeOptions)
}
