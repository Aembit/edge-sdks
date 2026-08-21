// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { TrustProviderError } from "../protocol/errors.js"
import { executeWithRetry } from "../protocol/retry.js"
import { isAbortError } from "../shared/http-utils.js"
import {
  buildAwsStsGetCallerIdentitySignedData,
  type AwsRoleSignerOptions,
  type AwsStsGetCallerIdentitySignedData
} from "./aws-role-signer.js"
import type { RetryPolicyOverride } from "../../types/retry.js"
import type { ClientWorkloadDetails, TrustProvider } from "../../types/trust-provider.js"

const DEFAULT_PROVIDER_ID = "aws-role"

type AwsRoleSigner = (
  options: AwsRoleSignerOptions
) => Promise<AwsStsGetCallerIdentitySignedData>

/**
 * Options for the built-in AWS Role Trust Provider.
 */
export interface AwsRoleTrustProviderOptions {
  /**
   * Stable provider id reported in auth session metadata.
   * Defaults to `"aws-role"`.
   */
  id?: string

  /**
   * AWS region used to scope the STS GetCallerIdentity SigV4 signature.
   */
  region: string

  /**
   * Retry override for AWS role identity collection.
   */
  retry?: RetryPolicyOverride

  /**
   * Optional signer injection for advanced runtime/testing scenarios.
   */
  signer?: AwsRoleSigner

  /**
   * Optional clock injection for deterministic tests.
   */
  now?: () => Date
}

class AwsRoleTrustProvider implements TrustProvider {
  /**
   * Internal AWS Role Trust Provider implementation.
   *
   * This provider resolves AWS credentials and builds signed STS
   * `GetCallerIdentity` request data for `client.aws.stsGetCallerIdentity`
   * in `/edge/v1/auth` requests.
   */
  readonly id: string
  readonly kind = "aws_role" as const

  private readonly region: string
  private readonly retry?: RetryPolicyOverride
  private readonly signer: AwsRoleSigner
  private readonly now?: () => Date

  constructor(options?: AwsRoleTrustProviderOptions) {
    this.id = resolveProviderId(options?.id)
    this.region = typeof options?.region === "string" ? options.region : ""
    this.retry = options?.retry
    this.signer = options?.signer ?? buildAwsStsGetCallerIdentitySignedData
    this.now = options?.now
  }

  getIdentitySingleFlightKey(): string {
    return `${this.kind}:${this.id}`
  }

  /**
   * Collects AWS role identity data for `/edge/v1/auth`.
   *
   * Returns `client` payload content compatible with
   * `aws.stsGetCallerIdentity.{headers,region}`.
   *
   * Throws `TrustProviderError` when region/configuration is invalid,
   * credential resolution fails, or signing fails.
   */
  async collectIdentity(): Promise<ClientWorkloadDetails> {
    return executeWithRetry(
      async () => this.collectIdentityOnce(),
      {
        policy: this.retry,
        isRetryableError: (error) =>
          error instanceof TrustProviderError && error.retryable === true
      }
    )
  }

  private async collectIdentityOnce(): Promise<ClientWorkloadDetails> {
    const region = resolveRegion(this.region)

    try {
      const signedData = await this.signer({
        region,
        now: this.now
      })

      return {
        aws: {
          stsGetCallerIdentity: {
            headers: signedData.headers,
            region: signedData.region
          }
        }
      }
    } catch (error) {
      throw mapRoleSignerError(error)
    }
  }
}

/**
 * Creates a Trust Provider that collects AWS Role identity using SigV4-signed STS request data.
 *
 * `region` is required for TypeScript callers. If JavaScript callers invoke this factory
 * with invalid runtime input, errors are normalized as `TrustProviderError` during collection.
 */
export function createAwsRoleTrustProvider(options: AwsRoleTrustProviderOptions): TrustProvider {
  const runtimeOptions = options && typeof options === "object" ? options : undefined
  return new AwsRoleTrustProvider(runtimeOptions)
}

function resolveProviderId(value: string | undefined): string {
  const id = typeof value === "string" ? value.trim() : ""
  return id.length > 0 ? id : DEFAULT_PROVIDER_ID
}

function resolveRegion(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (normalized.length === 0) {
    throw new TrustProviderError("AWS Role Trust Provider requires a non-empty region", {
      retryable: false
    })
  }

  return normalized
}

function mapRoleSignerError(error: unknown): TrustProviderError {
  if (error instanceof TrustProviderError) {
    return error
  }

  const baseMessage = "AWS Role Trust Provider failed to build STS GetCallerIdentity request data"

  if (isAbortError(error) || error instanceof TypeError) {
    return new TrustProviderError(baseMessage, {
      retryable: true,
      cause: error
    })
  }

  if (isRetryableCredentialResolutionError(error)) {
    return new TrustProviderError("AWS Role Trust Provider could not resolve AWS credentials", {
      retryable: true,
      cause: error
    })
  }

  if (isNonRetryableCredentialValidationError(error)) {
    return new TrustProviderError("AWS Role Trust Provider could not resolve AWS credentials", {
      retryable: false,
      cause: error
    })
  }

  return new TrustProviderError(baseMessage, {
    retryable: false,
    cause: error
  })
}

function isRetryableCredentialResolutionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes("could not load credentials")
}

function isNonRetryableCredentialValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes("accesskeyid") || message.includes("secretaccesskey")
}
