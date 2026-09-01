// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { TrustProviderError } from "../protocol/errors.js"
import { executeWithRetry, mergeRetryPolicy } from "../protocol/retry.js"
import { isAbortError, resolveRequestUrl } from "../shared/http-utils.js"
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { ClientWorkloadDetails, TrustProvider } from "../../types/trust-provider.js"
import {
  createMetadataServiceHttpError,
  isMetadataServiceNetworkError,
  resolveMetadataServiceProviderId,
  resolveMetadataServiceTimeoutMs
} from "./metadata-service-utils.js"

const DEFAULT_PROVIDER_ID = "aws-metadata-service"
const DEFAULT_IMDS_BASE_URL = "http://169.254.169.254"
const DEFAULT_IMDS_TIMEOUT_MS = 1000
const DEFAULT_IMDS_TOKEN_TTL_SECONDS = 21600

const IMDS_TOKEN_PATH = "/latest/api/token"
const IMDS_DOCUMENT_PATH = "/latest/dynamic/instance-identity/document"
const IMDS_SIGNATURE_PATH = "/latest/dynamic/instance-identity/signature"

/**
 * Options for the built-in AWS Metadata Service Trust Provider.
 */
export interface AwsMetadataServiceTrustProviderOptions {
  /**
   * Optional custom identifier for this Trust Provider instance used in structured logging and session metadata.
   * Defaults to `"aws-metadata-service"`.
   */
  id?: string

  /**
   * IMDS base URL. Defaults to EC2 metadata address.
   */
  baseUrl?: string

  /**
   * Request timeout for IMDS calls in milliseconds.
   * Defaults to `1000`.
   */
  timeoutMs?: number

  /**
   * IMDSv2 token TTL in seconds.
   * Defaults to `21600` (the AWS maximum).
   */
  tokenTtlSeconds?: number

  /**
   * Retry override for IMDS requests.
   */
  retry?: RetryPolicyOverride

  /**
   * Optional fetch injection for advanced runtime/testing scenarios.
   */
  fetchImpl?: typeof fetch
}

class AwsMetadataServiceTrustProvider implements TrustProvider {
  readonly id: string
  readonly kind = "aws_metadata_service" as const

  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly tokenTtlSeconds: number
  private readonly retry?: RetryPolicyOverride
  private readonly fetchImpl: typeof fetch

  constructor(options: AwsMetadataServiceTrustProviderOptions = {}) {
    this.id = resolveMetadataServiceProviderId(options.id, DEFAULT_PROVIDER_ID)
    this.baseUrl = options.baseUrl ?? DEFAULT_IMDS_BASE_URL
    this.timeoutMs = resolveMetadataServiceTimeoutMs(options.timeoutMs, DEFAULT_IMDS_TIMEOUT_MS)
    this.tokenTtlSeconds = resolveTokenTtlSeconds(options.tokenTtlSeconds)
    this.retry = options.retry
    this.fetchImpl = options.fetchImpl ?? fetch
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
    const metadataTokenResponse = await this.requestImdsText({
      method: "PUT",
      path: IMDS_TOKEN_PATH,
      headers: {
        "x-aws-ec2-metadata-token-ttl-seconds": String(this.tokenTtlSeconds)
      },
      operationName: "IMDSv2 token",
      retryableStatusCodes
    })
    const metadataToken = parseMetadataToken(metadataTokenResponse)

    const authHeaders = {
      "x-aws-ec2-metadata-token": metadataToken
    }

    const [instanceIdentityDocument, instanceIdentityDocumentSignature] = await Promise.all([
      this.requestImdsText({
        method: "GET",
        path: IMDS_DOCUMENT_PATH,
        headers: authHeaders,
        operationName: "instance identity document",
        retryableStatusCodes
      }),
      this.requestImdsText({
        method: "GET",
        path: IMDS_SIGNATURE_PATH,
        headers: authHeaders,
        operationName: "instance identity document signature",
        retryableStatusCodes
      })
    ])

    return {
      aws: {
        instanceIdentityDocument: encodeBase64(instanceIdentityDocument),
        instanceIdentityDocumentSignature
      }
    }
  }

  private async requestImdsText(options: {
    method: "GET" | "PUT"
    path: string
    headers?: Record<string, string>
    operationName: string
    retryableStatusCodes?: number[]
  }): Promise<string> {
    const signalController = new AbortController()
    const timeoutId = setTimeout(() => signalController.abort(), this.timeoutMs)
    let requestUrl: string

    try {
      try {
        requestUrl = resolveRequestUrl(this.baseUrl, options.path)
      } catch (error) {
        throw new TrustProviderError(
          `AWS Metadata Service ${options.operationName} request URL is invalid`,
          {
            retryable: false,
            cause: error
          }
        )
      }

      const response = await this.fetchImpl(requestUrl, {
        method: options.method,
        headers: options.headers,
        signal: signalController.signal
      })

      if (!response.ok) {
        throw createMetadataServiceHttpError({
          providerLabel: "AWS Metadata Service",
          statusCode: response.status,
          operationName: options.operationName,
          retryableStatusCodes: options.retryableStatusCodes
        })
      }

      const body = await response.text()
      if (body.length === 0) {
        throw new TrustProviderError(
          `AWS Metadata Service returned an empty ${options.operationName} response`,
          {
            retryable: false
          }
        )
      }

      return body
    } catch (error) {
      if (error instanceof TrustProviderError) {
        throw error
      }

      if (isAbortError(error)) {
        throw new TrustProviderError(
          `AWS Metadata Service ${options.operationName} request timed out after ${String(this.timeoutMs)}ms`,
          {
            retryable: true,
            cause: error
          }
        )
      }

      if (isMetadataServiceNetworkError(error)) {
        throw new TrustProviderError(
          `AWS Metadata Service ${options.operationName} request failed`,
          {
            retryable: true,
            cause: error
          }
        )
      }

      throw new TrustProviderError(
        `AWS Metadata Service ${options.operationName} request failed`,
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
 * Creates a Trust Provider that collects AWS EC2 identity using IMDSv2.
 */
export function createAwsMetadataServiceTrustProvider(
  options: AwsMetadataServiceTrustProviderOptions = {}
): TrustProvider {
  return new AwsMetadataServiceTrustProvider(options)
}

function resolveTokenTtlSeconds(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ttl = Math.floor(value)
    if (ttl >= 1 && ttl <= 21600) {
      return ttl
    }
  }

  return DEFAULT_IMDS_TOKEN_TTL_SECONDS
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64")
}

function parseMetadataToken(value: string): string {
  const token = value.trim()
  if (token.length === 0) {
    throw new TrustProviderError("AWS Metadata Service returned an empty IMDSv2 token response", {
      retryable: false
    })
  }

  return token
}
