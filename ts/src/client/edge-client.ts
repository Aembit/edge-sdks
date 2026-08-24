// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { EdgeApi } from "../internal/protocol/edge-api.js"
import {
  CredentialError,
  TrustProviderError
} from "../internal/protocol/errors.js"
import { EdgeHttpTransport } from "../internal/protocol/http-transport.js"
import type { EdgeCredentialsRequestBody } from "../internal/protocol/types.js"
import {
  calculateExpiresAtMs,
  formatExpiresAt,
  isTokenValid,
  normalizeServerRef,
  parseAccessToken,
  parseAuthSuccessBody,
  parseCredentialSuccessBody,
  resolveAuthExpirySkewMs,
  resolveEffectiveResourceSet,
  SafeLogger,
  serializeAuthSingleFlightKey,
  serializeEffectiveRetryPolicyKey,
  type CachedTokenState
} from "../internal/client/index.js"
import { isRecord } from "../internal/shared/type-guards.js"
import type { AuthSession } from "../types/auth.js"
import type { EdgeClientConfig } from "../types/client-config.js"
import type { CredentialResult, GetCredentialInput, GetCredentialOptions } from "../types/credential.js"
import type { RetryPolicyOverride } from "../types/retry.js"
import type {
  ClientWorkloadDetails,
  CollectedTrustProviderIdentity
} from "../types/trust-provider.js"

/**
 * High-level SDK client for authentication and credential retrieval.
 */
export class EdgeClient {
  private readonly config: EdgeClientConfig
  private readonly api: EdgeApi
  private readonly authExpirySkewMs: number
  private readonly logger: SafeLogger
  private tokenState?: CachedTokenState
  private readonly inFlightAuthByKey = new Map<string, Promise<CachedTokenState>>()
  private readonly inFlightIdentityByKey = new Map<string, Promise<CollectedTrustProviderIdentity>>()

  constructor(config: EdgeClientConfig) {
    this.config = config
    this.logger = new SafeLogger(config.logger)
    this.authExpirySkewMs = resolveAuthExpirySkewMs(config.authExpirySkewMs)
    this.api = new EdgeApi({
      transport: new EdgeHttpTransport({
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        retry: config.retry
      }),
      resourceSet: config.resourceSet
    })
    if (this.logger.isEnabled) {
      this.logger.debug("EdgeClient initialized", {
        baseUrl: config.baseUrl,
        clientId: config.clientId,
        trustProviderId: config.trustProvider.id
      })
    }
  }

  /**
   * Authenticates the configured workload and updates in-memory session state.
   * This method intentionally does not return raw access tokens.
   */
  async authenticate(): Promise<AuthSession> {
    if (this.logger.isEnabled) {
      this.logger.info("Authenticating workload", {
        clientId: this.config.clientId,
        trustProviderId: this.config.trustProvider.id
      })
    }
    const effectiveResourceSet = resolveEffectiveResourceSet(this.config.resourceSet, undefined)
    const identity = await this.collectIdentityWithMetadata()
    const tokenState = await this.authenticateWithSingleFlight(
      {},
      true,
      effectiveResourceSet,
      undefined,
      identity
    )
    const session: AuthSession = {
      authenticated: true,
      expiresAt: formatExpiresAt(tokenState.expiresAtMs),
      trustProviderId: this.config.trustProvider.id
    }
    if (this.logger.isEnabled) {
      this.logger.info("Workload authenticated successfully", {
        trustProviderId: session.trustProviderId,
        expiresAt: session.expiresAt
      })
    }
    return session
  }

  /**
   * Retrieves credentials for a target server.
   * Automatically authenticates when no valid token is cached.
   */
  async getCredential(
    input: GetCredentialInput,
    options: GetCredentialOptions = {}
  ): Promise<CredentialResult> {
    if (!input || typeof input !== "object") {
      this.logger.error("getCredential() failed: invalid input object")
      throw new CredentialError("getCredential() requires a valid input object", {
        retryable: false
      })
    }

    if (!("server" in input)) {
      this.logger.error("getCredential() failed: missing input.server")
      throw new CredentialError("getCredential() requires input.server", {
        retryable: false
      })
    }

    if (!options || typeof options !== "object") {
      this.logger.error("getCredential() failed: options must be an object")
      throw new CredentialError("getCredential() options must be an object", {
        retryable: false
      })
    }

    const server = normalizeServerRef(input.server)
    if (this.logger.isEnabled) {
      this.logger.info("Retrieving credential", {
        server: `${server.host}:${server.port}`,
        credentialType: input.credentialType
      })
    }
    const effectiveResourceSet = resolveEffectiveResourceSet(
      this.config.resourceSet,
      options.resourceSet
    )
    const identity = await this.collectIdentityWithMetadata()
    const bearerToken = await this.getValidAccessToken(
      options,
      effectiveResourceSet,
      identity
    )
    const body: EdgeCredentialsRequestBody = {
      client: identity.client,
      server,
      credentialType: input.credentialType,
      connectionMetadata: input.connectionMetadata,
      certSigningRequest: input.certSigningRequest
    }
    try {
      const response = await this.api.credentials(body, bearerToken, {
        resourceSet: options.resourceSet,
        retry: options.retry
      })
      const credentialBody = parseCredentialSuccessBody(response)
      const result: CredentialResult = {
        credentialType: credentialBody.credentialType,
        expiresAt: credentialBody.expiresAt ?? null,
        data: credentialBody.data ?? {}
      }
      if (this.logger.isEnabled) {
        this.logger.info("Credential retrieved successfully", {
          credentialType: result.credentialType,
          expiresAt: result.expiresAt
        })
      }
      return result
    } catch (error) {
      if (this.logger.isEnabled) {
        this.logger.error("Credential retrieval failed", {
          server: `${server.host}:${server.port}`,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
  }

  private async getValidAccessToken(
    options: GetCredentialOptions,
    effectiveResourceSet: string | undefined,
    identity: CollectedTrustProviderIdentity
  ): Promise<string> {
    const currentState = this.tokenState
    if (
      isTokenValid(currentState, Date.now(), this.authExpirySkewMs) &&
      currentState.resourceSet === effectiveResourceSet &&
      currentState.authCacheKey === identity.authCacheKey
    ) {
      if (this.logger.isEnabled) {
        this.logger.debug("Reusing valid cached access token", {
          authCacheKey: identity.authCacheKey,
          resourceSet: effectiveResourceSet
        })
      }
      return currentState.accessToken
    }

    this.logger.debug("Acquiring new access token")
    const nextState = await this.authenticateWithSingleFlight(
      {
        resourceSet: options.resourceSet,
        retry: options.retry
      },
      false,
      effectiveResourceSet,
      options.retry,
      identity
    )
    return nextState.accessToken
  }

  private async authenticateWithSingleFlight(
    options: { resourceSet?: string; retry?: EdgeClientConfig["retry"] },
    force: boolean,
    expectedResourceSet?: string,
    expectedRetry?: RetryPolicyOverride,
    identity?: CollectedTrustProviderIdentity
  ): Promise<CachedTokenState> {
    const currentState = this.tokenState
    if (
      !force &&
      isTokenValid(currentState, Date.now(), this.authExpirySkewMs) &&
      currentState.resourceSet === expectedResourceSet &&
      currentState.authCacheKey === identity?.authCacheKey
    ) {
      return currentState
    }

    const key = serializeAuthSingleFlightKey({
      resourceSet: expectedResourceSet,
      authCacheKey: identity?.authCacheKey,
      retryKey: serializeEffectiveRetryPolicyKey(this.config.retry, expectedRetry)
    })
    const inFlight = this.inFlightAuthByKey.get(key)
    if (inFlight) {
      return inFlight
    }

    const request = this.runAuthentication(options, expectedResourceSet, identity)
    this.inFlightAuthByKey.set(key, request)

    try {
      return await request
    } finally {
      if (this.inFlightAuthByKey.get(key) === request) {
        this.inFlightAuthByKey.delete(key)
      }
    }
  }

  private async runAuthentication(options: {
    resourceSet?: string
    retry?: EdgeClientConfig["retry"]
  },
    expectedResourceSet?: string,
    identity?: CollectedTrustProviderIdentity
  ): Promise<CachedTokenState> {
    try {
      const collectedIdentity = identity ?? (await this.collectIdentityWithMetadata())
      if (this.logger.isEnabled) {
        this.logger.debug("Sending authentication request to Edge API", {
          clientId: this.config.clientId,
          resourceSet: options.resourceSet
        })
      }
      const response = await this.api.auth(
        {
          clientId: this.config.clientId,
          client: collectedIdentity.client
        },
        {
          resourceSet: options.resourceSet,
          retry: options.retry
        }
      )
      const authBody = parseAuthSuccessBody(response)

      const accessToken = parseAccessToken(authBody.accessToken)
      const expiresAtMs = calculateExpiresAtMs(authBody.expiresIn, Date.now())
      const tokenState: CachedTokenState = {
        accessToken,
        expiresAtMs,
        resourceSet: resolveEffectiveResourceSet(this.config.resourceSet, options.resourceSet),
        authCacheKey: collectedIdentity.authCacheKey
      }
      this.tokenState = tokenState
      if (this.logger.isEnabled) {
        this.logger.debug("Authentication response received and token cached", {
          expiresAtMs
        })
      }
      return tokenState
    } catch (error) {
      if (this.logger.isEnabled) {
        this.logger.error("Authentication request failed", {
          clientId: this.config.clientId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      const currentTokenState = this.tokenState
      if (
        currentTokenState &&
        currentTokenState.resourceSet === expectedResourceSet &&
        !isTokenValid(currentTokenState, Date.now(), this.authExpirySkewMs)
      ) {
        this.tokenState = undefined
      }
      throw error
    }
  }

  private collectIdentityWithMetadata(): Promise<CollectedTrustProviderIdentity> {
    let singleFlightKey: string | undefined
    try {
      singleFlightKey = this.config.trustProvider.getIdentitySingleFlightKey?.()
    } catch (error) {
      if (error instanceof TrustProviderError) {
        throw error
      }

      throw new TrustProviderError(
        `Trust Provider '${this.config.trustProvider.id}' failed to collect identity`,
        {
          retryable: false,
          cause: error
        }
      )
    }

    if (!singleFlightKey) {
      return this.collectIdentityWithMetadataOnce()
    }

    const inFlight = this.inFlightIdentityByKey.get(singleFlightKey)
    if (inFlight) {
      return inFlight
    }

    const request = this.collectIdentityWithMetadataOnce()
    this.inFlightIdentityByKey.set(singleFlightKey, request)

    return request.finally(() => {
      if (this.inFlightIdentityByKey.get(singleFlightKey) === request) {
        this.inFlightIdentityByKey.delete(singleFlightKey)
      }
    })
  }

  private async collectIdentityWithMetadataOnce(): Promise<CollectedTrustProviderIdentity> {
    if (this.logger.isEnabled) {
      this.logger.debug("Collecting identity from Trust Provider", {
        trustProviderId: this.config.trustProvider.id
      })
    }
    try {
      const collected =
        typeof this.config.trustProvider.collectIdentityWithMetadata === "function"
          ? await this.config.trustProvider.collectIdentityWithMetadata()
          : {
              client: await this.config.trustProvider.collectIdentity()
            }

      if (this.logger.isEnabled) {
        this.logger.debug("Identity collected from Trust Provider", {
          trustProviderId: this.config.trustProvider.id,
          authCacheKey: collected.authCacheKey
        })
      }

      return {
        client: mergeClientWorkloadDetails(collected.client, this.config.clientWorkloadDetails),
        authCacheKey: collected.authCacheKey
      }
    } catch (error) {
      if (this.logger.isEnabled) {
        this.logger.error("Trust Provider failed to collect identity", {
          trustProviderId: this.config.trustProvider.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      if (error instanceof TrustProviderError) {
        throw error
      }

      throw new TrustProviderError(
        `Trust Provider '${this.config.trustProvider.id}' failed to collect identity`,
        {
          retryable: false,
          cause: error
        }
      )
    }
  }
}

function mergeClientWorkloadDetails(
  identity: ClientWorkloadDetails,
  additionalDetails: ClientWorkloadDetails | undefined
): ClientWorkloadDetails {
  if (!additionalDetails) {
    return identity
  }

  return mergeRecords(identity, additionalDetails)
}

function mergeRecords(
  base: Record<string, unknown>,
  overlay: object
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }

  for (const [key, overlayValue] of Object.entries(overlay)) {
    const baseValue = merged[key]
    if (isRecord(baseValue) && isRecord(overlayValue)) {
      merged[key] = mergeRecords(baseValue, overlayValue)
      continue
    }

    // Additional client workload details are additive only. Trust Provider
    // identity remains authoritative for any key path it already populated,
    // including explicit null values from provider-owned fields.
    if (typeof baseValue === "undefined") {
      merged[key] = overlayValue
    }
  }

  return merged
}
