// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { defaultProvider } from "@aws-sdk/credential-provider-node"
import { Hash } from "@smithy/hash-node"
import { HttpRequest } from "@smithy/protocol-http"
import { SignatureV4 } from "@smithy/signature-v4"

const STS_ACTION_BODY = "Action=GetCallerIdentity&Version=2011-06-15"
const STS_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8"

/**
 * Minimal AWS credential shape required for SigV4 request signing.
 */
export interface AwsCredentialIdentity {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export type AwsCredentialProvider = () => Promise<AwsCredentialIdentity>

/**
 * Input options for signing AWS STS GetCallerIdentity request data.
 */
export interface AwsRoleSignerOptions {
  /**
   * AWS region used for SigV4 scope and returned in the identity payload.
   */
  region: string

  /**
   * Optional credential provider for tests/advanced usage.
   * Defaults to AWS SDK default credential provider chain.
   */
  credentialsProvider?: AwsCredentialProvider

  /**
   * Optional clock injection for deterministic tests.
   * Defaults to current system time.
   */
  now?: () => Date
}

/**
 * Signed STS request data expected by `client.aws.stsGetCallerIdentity` in `/edge/v1/auth`.
 */
export interface AwsStsGetCallerIdentitySignedData {
  headers: Record<string, string>
  region: string
}

/**
 * Builds SigV4-signed STS GetCallerIdentity request headers for AWS Role trust provider auth.
 */
export async function buildAwsStsGetCallerIdentitySignedData(
  options: AwsRoleSignerOptions
): Promise<AwsStsGetCallerIdentitySignedData> {
  const region = resolveRegion(options.region)
  // Create default provider per call so runtime credential-source changes can be observed.
  const credentialsProvider = options.credentialsProvider ?? defaultProvider()
  const credentials = await credentialsProvider()
  assertCredentials(credentials)

  const host = resolveStsHost(region)
  const request = new HttpRequest({
    protocol: "https:",
    hostname: host,
    method: "POST",
    path: "/",
    headers: {
      host,
      "content-type": STS_CONTENT_TYPE
    },
    body: STS_ACTION_BODY
  })

  const signer = new SignatureV4({
    service: "sts",
    region,
    credentials,
    sha256: Hash.bind(null, "sha256")
  })

  const signedRequest = await signer.sign(request, {
    signingDate: options.now?.() ?? new Date()
  })

  return {
    headers: normalizeHeaders(signedRequest.headers),
    region
  }
}

function resolveRegion(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error("AWS Role Trust Provider requires a non-empty region")
  }

  return normalized
}

function resolveStsHost(region: string): string {
  if (region.startsWith("cn-")) {
    return `sts.${region}.amazonaws.com.cn`
  }

  return `sts.${region}.amazonaws.com`
}

function assertCredentials(credentials: AwsCredentialIdentity): void {
  if (credentials.accessKeyId.trim().length === 0) {
    throw new Error("AWS credential provider returned an empty accessKeyId")
  }

  if (credentials.secretAccessKey.trim().length === 0) {
    throw new Error("AWS credential provider returned an empty secretAccessKey")
  }
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value
    }
  }
  return normalized
}
