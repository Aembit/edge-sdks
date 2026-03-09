import { EdgeApi } from "../internal/protocol/edge-api.js"
import {
  AuthError,
  CredentialError,
  TrustProviderError
} from "../internal/protocol/errors.js"
import { EdgeHttpTransport } from "../internal/protocol/http-transport.js"
import type { AuthSession } from "../types/auth.js"
import type { EdgeClientConfig } from "../types/client-config.js"
import type {
  CredentialResult,
  CredentialServerRef,
  GetCredentialInput,
  GetCredentialOptions
} from "../types/credential.js"
import type { RetryPolicyOverride } from "../types/retry.js"
import type { ClientWorkloadDetails } from "../types/trust-provider.js"

const DEFAULT_AUTH_EXPIRY_SKEW_MS = 60_000

interface CachedTokenState {
  accessToken: string
  expiresAtMs: number | null
  resourceSet?: string
}

interface AuthSingleFlightKey {
  resourceSet?: string
  retryKey: string
}

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

    return {
      credentialType: response.credentialType,
      expiresAt: response.expiresAt ?? null,
      data: response.data ?? {}
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
      retryKey: serializeRetryPolicyOverride(expectedRetry)
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

      const accessToken = parseAccessToken(response.accessToken)
      const expiresAtMs = calculateExpiresAtMs(response.expiresIn, Date.now())
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
      return await this.config.trustProvider.collectIdentity()
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

function normalizeServerRef(server: CredentialServerRef): {
  host: string
  port: number
  transportProtocol: "TCP"
} {
  if (!server || typeof server !== "object") {
    throw new CredentialError("getCredential() requires a valid server object", {
      retryable: false
    })
  }

  if (typeof server.host !== "string") {
    throw new CredentialError("getCredential() requires server.host", {
      retryable: false
    })
  }

  const host = server.host.trim()
  if (host.length === 0) {
    throw new CredentialError("getCredential() requires server.host", {
      retryable: false
    })
  }

  if (!Number.isInteger(server.port) || server.port <= 0 || server.port > 65535) {
    throw new CredentialError("getCredential() requires a valid server.port", {
      retryable: false
    })
  }

  const transportProtocol = server.transportProtocol ?? "TCP"
  if (transportProtocol !== "TCP") {
    throw new CredentialError(
      `Unsupported server.transportProtocol '${transportProtocol}'. Only 'TCP' is supported`,
      {
        retryable: false
      }
    )
  }

  return {
    host,
    port: server.port,
    transportProtocol
  }
}

function parseAccessToken(token: string | null | undefined): string {
  const value = typeof token === "string" ? token.trim() : ""
  if (value.length === 0) {
    throw new AuthError("Edge auth response missing accessToken", {
      retryable: false
    })
  }

  return value
}

function calculateExpiresAtMs(
  expiresInSeconds: number | undefined,
  nowMs: number
): number | null {
  if (expiresInSeconds === undefined) {
    return null
  }

  if (
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds < 0
  ) {
    throw new AuthError("Edge auth response contains invalid expiresIn", {
      retryable: false
    })
  }

  return nowMs + Math.round(expiresInSeconds * 1000)
}

function isTokenValid(
  tokenState: CachedTokenState | undefined,
  nowMs: number,
  skewMs: number
): tokenState is CachedTokenState {
  if (!tokenState) {
    return false
  }

  if (tokenState.expiresAtMs === null) {
    return true
  }

  return nowMs < tokenState.expiresAtMs - skewMs
}

function resolveAuthExpirySkewMs(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }

  return DEFAULT_AUTH_EXPIRY_SKEW_MS
}

function formatExpiresAt(expiresAtMs: number | null): string | null {
  if (expiresAtMs === null) {
    return null
  }

  return new Date(expiresAtMs).toISOString()
}

function resolveEffectiveResourceSet(
  defaultResourceSet: string | undefined,
  requestResourceSet: string | undefined
): string | undefined {
  return requestResourceSet ?? defaultResourceSet
}

function serializeAuthSingleFlightKey(key: AuthSingleFlightKey): string {
  return JSON.stringify([key.resourceSet ?? null, key.retryKey])
}

function serializeRetryPolicyOverride(retry: RetryPolicyOverride | undefined): string {
  if (!retry) {
    return ""
  }

  return JSON.stringify({
    enabled: retry.enabled,
    maxAttempts: retry.maxAttempts,
    baseDelayMs: retry.baseDelayMs,
    maxDelayMs: retry.maxDelayMs,
    jitter: retry.jitter,
    retryableStatusCodes: retry.retryableStatusCodes
  })
}
