// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "terraform-cloud-identity-token"

/**
 * Options for the built-in Terraform Cloud Identity Token Trust Provider.
 */
export interface TerraformCloudIdentityTokenTrustProviderOptions {
  /**
   * Optional custom identifier for this Trust Provider instance used in structured logging and session metadata.
   * Defaults to `"terraform-cloud-identity-token"`.
   */
  id?: string

  /**
   * Terraform Cloud workload identity token or a lazy token source.
   *
   * Use a function when the token is request-scoped or must be fetched at call time.
   */
  identityToken: IdentityTokenSource

  /**
   * Retry override for Terraform Cloud identity token collection.
   */
  retry?: RetryPolicyOverride
}

const TerraformCloudIdentityTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "terraform_cloud_identity_token",
  subjectKey: "terraform",
  authCacheKeyPrefix: "terraform",
  errorLabel: "Terraform Cloud Identity Token Trust Provider"
})

/**
 * Creates a Trust Provider that sends a Terraform Cloud identity token as
 * `client.terraform.identityToken`.
 */
export function createTerraformCloudIdentityTokenTrustProvider(
  options: TerraformCloudIdentityTokenTrustProviderOptions
): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new TerraformCloudIdentityTokenTrustProvider(runtimeOptions)
}
