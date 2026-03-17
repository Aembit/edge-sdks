import { TrustProviderError } from "../protocol/errors.js"
import { executeWithRetry, isRetryableHttpStatus, mergeRetryPolicy } from "../protocol/retry.js"
import { isAbortError, resolveRequestUrl } from "../shared/http-utils.js"
import { isRecord } from "../shared/type-guards.js"
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { ClientWorkloadDetails, TrustProvider } from "../../types/trust-provider.js"

const DEFAULT_PROVIDER_ID = "azure-metadata-service"
const DEFAULT_IMDS_BASE_URL = "http://169.254.169.254"
const DEFAULT_IMDS_TIMEOUT_MS = 1000
const DEFAULT_IMDS_API_VERSION = "2025-04-07"
const IMDS_ATTESTED_DOCUMENT_PATH = "/metadata/attested/document"

/**
 * Options for the built-in Azure Metadata Service Trust Provider.
 */
export interface AzureMetadataServiceTrustProviderOptions {
  /**
   * Stable provider id reported in auth session metadata.
   * Defaults to `"azure-metadata-service"`.
   */
  id?: string

  /**
   * Azure IMDS base URL. Defaults to the Azure metadata address.
   */
  baseUrl?: string

  /**
   * Azure IMDS API version used for the attested document request.
   */
  apiVersion?: string

  /**
   * Request timeout for IMDS calls in milliseconds.
   * Defaults to `1000`.
   */
  timeoutMs?: number

  /**
   * Retry override for Azure IMDS requests.
   */
  retry?: RetryPolicyOverride

  /**
   * Optional fetch injection for advanced runtime/testing scenarios.
   */
  fetchImpl?: typeof fetch

  /**
   * Optional nonce generator for deterministic tests.
   */
  nonce?: () => string
}

class AzureMetadataServiceTrustProvider implements TrustProvider {
  /**
   * Internal Azure Metadata Service Trust Provider implementation.
   *
   * This provider fetches Azure IMDS attested-data and sends the PKCS#7
   * signature blob plus the request nonce as
   * `client.azure.attestedDocument.{encoding,signature,nonce}` in `/edge/v1/auth`.
   */
  readonly id: string
  readonly kind = "azure_metadata_service" as const

  private readonly baseUrl: string
  private readonly apiVersion: string
  private readonly timeoutMs: number
  private readonly retry?: RetryPolicyOverride
  private readonly fetchImpl: typeof fetch
  private readonly nonce: () => string

  constructor(options: AzureMetadataServiceTrustProviderOptions = {}) {
    this.id = resolveProviderId(options.id)
    this.baseUrl = options.baseUrl ?? DEFAULT_IMDS_BASE_URL
    this.apiVersion = resolveApiVersion(options.apiVersion)
    this.timeoutMs = resolveTimeoutMs(options.timeoutMs)
    this.retry = options.retry
    this.fetchImpl = options.fetchImpl ?? fetch
    this.nonce = options.nonce ?? createNonce
  }

  getIdentitySingleFlightKey(): string {
    return `${this.kind}:${this.id}`
  }

  async collectIdentity(): Promise<ClientWorkloadDetails> {
    const effectiveRetryPolicy = mergeRetryPolicy(this.retry)

    return executeWithRetry(
      async () => this.collectIdentityOnce(effectiveRetryPolicy.retryableStatusCodes),
      {
        policy: this.retry,
        isRetryableError: (error) =>
          error instanceof TrustProviderError && error.retryable === true
      }
    )
  }

  private async collectIdentityOnce(retryableStatusCodes?: number[]): Promise<ClientWorkloadDetails> {
    const nonce = resolveNonce(this.nonce())
    const attestedDocument = await this.requestAttestedDocument(nonce, retryableStatusCodes)

    // The PKCS#7 signature returned by Azure IMDS contains the signed attested
    // document and certificate chain, so the pinned Aembit schema only needs
    // the encoding, signature blob, and nonce.
    return {
      azure: {
        attestedDocument: {
          encoding: attestedDocument.encoding,
          signature: attestedDocument.signature,
          nonce
        }
      }
    }
  }

  private async requestAttestedDocument(
    nonce: string,
    retryableStatusCodes?: number[]
  ): Promise<{ encoding: string; signature: string }> {
    const signalController = new AbortController()
    const timeoutId = setTimeout(() => signalController.abort(), this.timeoutMs)
    let requestUrl: string

    try {
      try {
        const url = new URL(resolveRequestUrl(this.baseUrl, IMDS_ATTESTED_DOCUMENT_PATH))
        url.searchParams.set("api-version", this.apiVersion)
        url.searchParams.set("nonce", nonce)
        requestUrl = url.toString()
      } catch (error) {
        throw new TrustProviderError(
          "Azure Metadata Service attested document request URL is invalid",
          {
            retryable: false,
            cause: error
          }
        )
      }

      const response = await this.fetchImpl(requestUrl, {
        method: "GET",
        headers: {
          Metadata: "true"
        },
        signal: signalController.signal
      })

      if (!response.ok) {
        throw createImdsHttpError(
          response.status,
          "attested document",
          retryableStatusCodes
        )
      }

      return parseAttestedDocument(await response.json())
    } catch (error) {
      if (error instanceof TrustProviderError) {
        throw error
      }

      if (isAbortError(error)) {
        throw new TrustProviderError(
          `Azure Metadata Service attested document request timed out after ${String(this.timeoutMs)}ms`,
          {
            retryable: true,
            cause: error
          }
        )
      }

      if (isNetworkError(error)) {
        throw new TrustProviderError(
          "Azure Metadata Service attested document request failed",
          {
            retryable: true,
            cause: error
          }
        )
      }

      throw new TrustProviderError(
        "Azure Metadata Service attested document request failed",
        {
          retryable: false,
          cause: error
        }
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Creates a Trust Provider that collects Azure VM identity using Azure IMDS
 * attested data.
 */
export function createAzureMetadataServiceTrustProvider(
  options: AzureMetadataServiceTrustProviderOptions = {}
): TrustProvider {
  return new AzureMetadataServiceTrustProvider(options)
}

function resolveProviderId(value: string | undefined): string {
  const id = typeof value === "string" ? value.trim() : ""
  return id.length > 0 ? id : DEFAULT_PROVIDER_ID
}

function resolveApiVersion(value: string | undefined): string {
  const apiVersion = typeof value === "string" ? value.trim() : ""
  return apiVersion.length > 0 ? apiVersion : DEFAULT_IMDS_API_VERSION
}

function resolveTimeoutMs(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value))
  }

  return DEFAULT_IMDS_TIMEOUT_MS
}

function resolveNonce(value: string): string {
  const nonce = typeof value === "string" ? value.trim() : ""
  if (!/^\d{10}$/.test(nonce)) {
    throw new TrustProviderError(
      "Azure Metadata Service Trust Provider requires a 10-digit nonce",
      {
        retryable: false
      }
    )
  }

  return nonce
}

function createNonce(): string {
  return String(Math.floor(Date.now() / 1000)).padStart(10, "0")
}

function parseAttestedDocument(body: unknown): { encoding: string; signature: string } {
  if (!isRecord(body)) {
    throw new TrustProviderError(
      "Azure Metadata Service returned an invalid attested document response",
      {
        retryable: false
      }
    )
  }

  const signature = typeof body.signature === "string" ? body.signature.trim() : ""
  if (signature.length === 0) {
    throw new TrustProviderError(
      "Azure Metadata Service returned an empty attested document signature",
      {
        retryable: false
      }
    )
  }

  const encoding = typeof body.encoding === "string" ? body.encoding.trim() : "pkcs7"

  return {
    encoding: encoding.length > 0 ? encoding : "pkcs7",
    signature
  }
}

function createImdsHttpError(
  statusCode: number,
  operationName: string,
  retryableStatusCodes: number[] = []
): TrustProviderError {
  return new TrustProviderError(
    `Azure Metadata Service ${operationName} request failed with status ${String(statusCode)}`,
    {
      statusCode,
      retryable: isRetryableHttpStatus(statusCode, retryableStatusCodes)
    }
  )
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
}
