// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { TrustProvider } from "../../types/trust-provider.js"
import {
  createTokenTrustProviderClass,
  type IdentityTokenSource
} from "./token-trust-provider.js"

const DEFAULT_PROVIDER_ID = "k8s-service-account"

/**
 * Options for the built-in Kubernetes Service Account Trust Provider.
 */
export interface K8sServiceAccountTrustProviderOptions {
  /**
   * Optional custom identifier for this Trust Provider instance used in structured logging and session metadata.
   * Defaults to `"k8s-service-account"`.
   */
  id?: string

  /**
   * Kubernetes service account JWT token or a lazy token source.
   *
   * Use a function when the token is request-scoped or read from a projected volume at call time.
   */
  serviceAccountToken: IdentityTokenSource

  /**
   * Retry override for Kubernetes service account token collection.
   */
  retry?: RetryPolicyOverride
}

const K8sServiceAccountTrustProvider = createTokenTrustProviderClass({
  defaultId: DEFAULT_PROVIDER_ID,
  kind: "k8s_service_account",
  subjectKey: "k8s",
  payloadPropertyName: "serviceAccountToken",
  authCacheKeyPrefix: "k8s",
  errorLabel: "Kubernetes Service Account Trust Provider"
})

/**
 * Creates a Trust Provider that sends a Kubernetes service account token as
 * `client.k8s.serviceAccountToken`.
 */
export function createK8sServiceAccountTrustProvider(
  options: K8sServiceAccountTrustProviderOptions
): TrustProvider {
  const runtimeOptions =
    options && typeof options === "object"
      ? {
          id: options.id,
          identityToken: options.serviceAccountToken,
          retry: options.retry
        }
      : undefined
  return new K8sServiceAccountTrustProvider(runtimeOptions)
}
