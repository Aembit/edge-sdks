import { TrustProviderError } from "../protocol/errors.js"
import { isRetryableHttpStatus } from "../protocol/retry.js"

/**
 * Shared utility functions for metadata-service Trust Provider implementations.
 */

/**
 * Resolves a provider id, falling back to a stable default when the caller
 * provides an empty or non-string value.
 */
export function resolveMetadataServiceProviderId(
  value: string | undefined,
  defaultId: string
): string {
  const id = typeof value === "string" ? value.trim() : ""
  return id.length > 0 ? id : defaultId
}

/**
 * Resolves request timeout configuration for metadata-service calls.
 *
 * Invalid, missing, or non-positive values fall back to the provider default.
 */
export function resolveMetadataServiceTimeoutMs(
  value: number | undefined,
  defaultTimeoutMs: number
): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value))
  }

  return defaultTimeoutMs
}

export interface MetadataServiceHttpErrorOptions {
  providerLabel: string
  operationName: string
  statusCode: number
  retryableStatusCodes?: number[]
}

/**
 * Creates a normalized HTTP-status error for metadata-service requests.
 */
export function createMetadataServiceHttpError(
  options: MetadataServiceHttpErrorOptions
): TrustProviderError {
  return new TrustProviderError(
    `${options.providerLabel} ${options.operationName} request failed with status ${String(options.statusCode)}`,
    {
      statusCode: options.statusCode,
      retryable: isRetryableHttpStatus(
        options.statusCode,
        options.retryableStatusCodes ?? []
      )
    }
  )
}

/**
 * Detects the fetch/network failure shape used by the supported runtimes for
 * metadata-service request failures.
 */
export function isMetadataServiceNetworkError(error: unknown): boolean {
  return error instanceof TypeError
}
