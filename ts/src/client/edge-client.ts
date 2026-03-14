import { EdgeApi } from "../internal/protocol/edge-api.js"
import {
  CredentialError,
  TrustProviderError
} from "../internal/protocol/errors.js"
import { EdgeHttpTransport } from "../internal/protocol/http-transport.js"
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
  serializeAuthSingleFlightKey,
  serializeEffectiveRetryPolicyKey
} from "../internal/client/index.js"
import { isRecord } from "../internal/shared/type-guards.js"
import type { AuthSession } from "../types/auth.js"
import type { EdgeClientConfig } from "../types/client-config.js"
import type { CredentialResult, GetCredentialInput, GetCredentialOptions } from "../types/credential.js"
import type { RetryPolicyOverride } from "../types/retry.js"
import type { ClientWorkloadDetails } from "../types/trust-provider.js"
import type { CachedTokenState } from "../internal/client/index.js"

/**
 * High-level SDK client for authentication and credential retrieval.
 */
export class EdgeClient {
  private readonly config: EdgeClientConfig
  private readonly api: EdgeApi
  private readonly authExpirySkewMs: number
  private tokenState?: CachedTokenState
  private readonly inFlightAuthByKey = new Map<string, Promise<CachedTokenState>>()

  constructor(config: EdgeClientConfig) {
    this.config = config
    this.authExpirySkewMs = resolveAuthExpirySkewMs(config.authExpirySkewMs)
    this.api = new EdgeApi({
      transport: new EdgeHttpTransport({
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        retry: config.retry
      }),
      resourceSet: config.resourceSet
    })
  }

  /**
   * Authenticates the configured workload and updates in-memory session state.
   * This method intentionally does not return raw access tokens.
   */
  async authenticate(): Promise<AuthSession> {
    const effectiveResourceSet = resolveEffectiveResourceSet(this.config.resourceSet, undefined)
    const tokenState = await this.authenticateWithSingleFlight(
      {},
      true,
      effectiveResourceSet,
      undefined
    )
    return {
      authenticated: true,
      expiresAt: formatExpiresAt(tokenState.expiresAtMs),
      trustProviderId: this.config.trustProvider.id
    }
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
      throw new CredentialError("getCredential() requires a valid input object", {
        retryable: false
      })
    }

    if (!("server" in input)) {
      throw new CredentialError("getCredential() requires input.server", {
        retryable: false
      })
    }

    if (!options || typeof options !== "object") {
      throw new CredentialError("getCredential() options must be an object", {
        retryable: false
      })
    }

    const server = normalizeServerRef(input.server)
    const effectiveResourceSet = resolveEffectiveResourceSet(
      this.config.resourceSet,
      options.resourceSet
    )
    const bearerToken = await this.getValidAccessToken(options, effectiveResourceSet)
    const identity = await this.collectIdentity()
    const body = {
      client: identity,
      server,
      credentialType: input.credentialType
    }
    const response = await this.api.credentials(body, bearerToken, {
      resourceSet: options.resourceSet,
      retry: options.retry
    })
    const credentialBody = parseCredentialSuccessBody(response)

    return {
      credentialType: credentialBody.credentialType,
      expiresAt: credentialBody.expiresAt ?? null,
      data: credentialBody.data ?? {}
    }
  }

  private async getValidAccessToken(
    options: GetCredentialOptions,
    effectiveResourceSet?: string
  ): Promise<string> {
    const currentState = this.tokenState
    if (
      isTokenValid(currentState, Date.now(), this.authExpirySkewMs) &&
      currentState.resourceSet === effectiveResourceSet
    ) {
      return currentState.accessToken
    }

    const nextState = await this.authenticateWithSingleFlight(
      {
        resourceSet: options.resourceSet,
        retry: options.retry
      },
      false,
      effectiveResourceSet,
      options.retry
    )
    return nextState.accessToken
  }

  private async authenticateWithSingleFlight(
    options: { resourceSet?: string; retry?: EdgeClientConfig["retry"] },
    force: boolean,
    expectedResourceSet?: string,
    expectedRetry?: RetryPolicyOverride
  ): Promise<CachedTokenState> {
    const currentState = this.tokenState
    if (
      !force &&
      isTokenValid(currentState, Date.now(), this.authExpirySkewMs) &&
      currentState.resourceSet === expectedResourceSet
    ) {
      return currentState
    }

    const key = serializeAuthSingleFlightKey({
      resourceSet: expectedResourceSet,
      retryKey: serializeEffectiveRetryPolicyKey(this.config.retry, expectedRetry)
    })
    const inFlight = this.inFlightAuthByKey.get(key)
    if (inFlight) {
      return inFlight
    }

    const request = this.runAuthentication(options, expectedResourceSet)
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
    expectedResourceSet?: string
  ): Promise<CachedTokenState> {
    try {
      const identity = await this.collectIdentity()
      const response = await this.api.auth(
        {
          clientId: this.config.clientId,
          client: identity
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
        resourceSet: resolveEffectiveResourceSet(this.config.resourceSet, options.resourceSet)
      }
      this.tokenState = tokenState
      return tokenState
    } catch (error) {
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

  private async collectIdentity(): Promise<ClientWorkloadDetails> {
    try {
      const identity = await this.config.trustProvider.collectIdentity()
      return mergeClientWorkloadDetails(identity, this.config.clientWorkloadDetails)
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
  overlay: Record<string, unknown>
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
