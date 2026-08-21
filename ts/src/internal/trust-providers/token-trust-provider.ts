// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { TrustProviderError } from "../protocol/errors.js"
import { executeWithRetry } from "../protocol/retry.js"
import type { RetryPolicyOverride } from "../../types/retry.js"
import type {
  ClientWorkloadDetails,
  CollectedTrustProviderIdentity,
  TrustProvider,
  TrustProviderKind
} from "../../types/trust-provider.js"

/**
 * Shared implementation for token-based Trust Providers such as GCP identity
 * token and OIDC ID token.
 *
 * The provider-specific adapters keep the public factory names, option types,
 * payload keys, and error labels stable while delegating the common functionality
 * here: token resolution, retry handling, auth-cache scoping, and
 * single-flight coordination hints.
 */

/**
 * Token source accepted by token-based Trust Providers.
 *
 * A static string is treated as stable for the lifetime of the provider
 * instance. A function source is assumed to be dynamic and may return a
 * different token on each call.
 */
export type IdentityTokenSource = string | (() => string | Promise<string>)

/**
 * Common runtime options shared by token-based Trust Providers.
 *
 * The concrete provider modules continue to export their own option types so
 * the public API stays explicit and provider-specific.
 */
export interface TokenTrustProviderOptions {
  id?: string
  identityToken?: IdentityTokenSource
  retry?: RetryPolicyOverride
}

/**
 * Provider-specific values injected into the shared token-provider
 * implementation.
 */
export interface TokenTrustProviderDefinition {
  defaultId: string
  kind: TrustProviderKind
  subjectKey: string
  authCacheKeyPrefix: string
  errorLabel: string
}

/**
 * Creates an internal Trust Provider class for providers whose identity model
 * is just `{subjectKey: { identityToken }}`.
 *
 * The returned class preserves provider-specific outward behavior while
 * centralizing the shared lifecycle and error semantics.
 */
export function createTokenTrustProviderClass(definition: TokenTrustProviderDefinition): {
  new(options?: TokenTrustProviderOptions): TrustProvider
} {
  return class TokenTrustProvider implements TrustProvider {
    readonly id: string
    readonly kind = definition.kind

    private readonly identityToken?: IdentityTokenSource
    private readonly retry?: RetryPolicyOverride

    constructor(options?: TokenTrustProviderOptions) {
      this.id = resolveProviderId(options?.id, definition.defaultId)
      this.identityToken = options?.identityToken
      this.retry = options?.retry
    }

    getIdentitySingleFlightKey(): string | undefined {
      // Only static token strings are safe to de-duplicate across concurrent
      // calls. Function-based sources may be request-scoped or time-varying, so
      // they intentionally opt out of single-flight identity collection.
      return typeof this.identityToken === "string" ? `${this.kind}:${this.id}` : undefined
    }

    async collectIdentity(): Promise<ClientWorkloadDetails> {
      // Keep one collection path so `collectIdentity()` and
      // `collectIdentityWithMetadata()` cannot drift in payload shape.
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
      const identityToken = await resolveIdentityToken(this.identityToken, definition.errorLabel)
      const authCacheKey = await buildAuthCacheKey(identityToken, definition.authCacheKeyPrefix)

      return {
        client: {
          [definition.subjectKey]: {
            identityToken
          }
        },
        authCacheKey
      }
    }
  }
}

function resolveProviderId(value: string | undefined, defaultId: string): string {
  const id = typeof value === "string" ? value.trim() : ""
  return id.length > 0 ? id : defaultId
}

async function resolveIdentityToken(
  source: IdentityTokenSource | undefined,
  errorLabel: string
): Promise<string> {
  if (typeof source === "undefined") {
    throw new TrustProviderError(`${errorLabel} requires configuration`, {
      retryable: false
    })
  }

  try {
    const rawValue = typeof source === "function" ? await source() : source
    const identityToken = typeof rawValue === "string" ? rawValue.trim() : ""

    if (identityToken.length === 0) {
      throw new TrustProviderError(`${errorLabel} requires a non-empty identity token`, {
        retryable: false
      })
    }

    return identityToken
  } catch (error) {
    if (error instanceof TrustProviderError) {
      throw error
    }

    // Errors thrown by dynamic token sources are treated as potentially
    // transient so caller-configured retry policy can recover from temporary
    // token-fetch failures.
    throw new TrustProviderError(`${errorLabel} failed to resolve the identity token`, {
      retryable: true,
      cause: error
    })
  }
}

async function buildAuthCacheKey(identityToken: string, prefix: string): Promise<string> {
  // Cache scoping is based on token content, but the raw token should not be
  // stored in memory as the cache key. Prefixes preserve provider boundaries so
  // equal token strings from different providers cannot collide.
  const encoder = new TextEncoder()
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(identityToken))
  const bytes = new Uint8Array(digest)
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `${prefix}:${hex}`
}
