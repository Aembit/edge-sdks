// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "gitlab-identity-token"

/**
 * Options for the built-in GitLab Identity Token Trust Provider.
 */
export interface GitLabIdentityTokenTrustProviderOptions {
  /**
   * Stable provider id reported in auth session metadata.
   * Defaults to `"gitlab-identity-token"`.
   */
  id?: string

  /**
   * GitLab CI/CD job OIDC identity token or a lazy token source.
   *
   * Use a function when the token is request-scoped or must be fetched at call time.
   */
  identityToken: IdentityTokenSource

  /**
   * Retry override for GitLab identity token collection.
   */
  retry?: RetryPolicyOverride
}

const GitLabIdentityTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "gitlab_identity_token",
  subjectKey: "gitlab",
  authCacheKeyPrefix: "gitlab",
  errorLabel: "GitLab Identity Token Trust Provider"
})

/**
 * Creates a Trust Provider that sends a GitLab CI/CD identity token as
 * `client.gitlab.identityToken`.
 */
export function createGitLabIdentityTokenTrustProvider(
  options: GitLabIdentityTokenTrustProviderOptions
): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new GitLabIdentityTokenTrustProvider(runtimeOptions)
}
