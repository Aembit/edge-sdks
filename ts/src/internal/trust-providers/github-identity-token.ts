// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "github-identity-token"

/**
 * Options for the built-in GitHub Identity Token Trust Provider.
 */
export interface GitHubIdentityTokenTrustProviderOptions {
  /**
   * Stable provider id reported in auth session metadata.
   * Defaults to `"github-identity-token"`.
   */
  id?: string

  /**
   * GitHub Actions OIDC identity token or a lazy token source.
   *
   * Use a function when the token is request-scoped or must be fetched at call time.
   */
  identityToken: IdentityTokenSource

  /**
   * Retry override for GitHub identity token collection.
   */
  retry?: RetryPolicyOverride
}

const GitHubIdentityTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "github_identity_token",
  subjectKey: "github",
  authCacheKeyPrefix: "github",
  errorLabel: "GitHub Identity Token Trust Provider"
})

/**
 * Creates a Trust Provider that sends a GitHub Actions identity token as
 * `client.github.identityToken`.
 */
export function createGitHubIdentityTokenTrustProvider(
  options: GitHubIdentityTokenTrustProviderOptions
): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new GitHubIdentityTokenTrustProvider(runtimeOptions)
}
