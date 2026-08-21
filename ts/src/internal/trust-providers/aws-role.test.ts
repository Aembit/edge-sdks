// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import { createAwsRoleTrustProvider, type AwsRoleTrustProviderOptions } from "./aws-role.js"

describe("createAwsRoleTrustProvider", () => {
  it("collects signed stsGetCallerIdentity payload", async () => {
    const signer = vi.fn(async () => ({
      headers: {
        host: "sts.us-east-1.amazonaws.com",
        authorization: "AWS4-HMAC-SHA256 Credential=AKID/..."
      },
      region: "us-east-1"
    }))

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer
    })

    const identity = await provider.collectIdentity()

    expect(provider.id).toBe("aws-role")
    expect(provider.kind).toBe("aws_role")
    expect(identity).toEqual({
      aws: {
        stsGetCallerIdentity: {
          headers: {
            host: "sts.us-east-1.amazonaws.com",
            authorization: "AWS4-HMAC-SHA256 Credential=AKID/..."
          },
          region: "us-east-1"
        }
      }
    })
    expect(signer).toHaveBeenCalledTimes(1)
    expect(signer).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "us-east-1"
      })
    )
  })

  it("uses custom id when provided", async () => {
    const provider = createAwsRoleTrustProvider({
      id: "custom-aws-role",
      region: "us-east-1",
      signer: async () => ({
        headers: { host: "sts.us-east-1.amazonaws.com" },
        region: "us-east-1"
      })
    })

    await provider.collectIdentity()
    expect(provider.id).toBe("custom-aws-role")
  })

  it("fails with non-retryable error when region is invalid", async () => {
    const signer = vi.fn(async () => ({
      headers: {},
      region: "ignored"
    }))

    const provider = createAwsRoleTrustProvider({
      region: "  ",
      signer
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
    expect(signer).toHaveBeenCalledTimes(0)
  })

  it("does not throw TypeError when options are missing at runtime", async () => {
    const provider = createAwsRoleTrustProvider(
      undefined as unknown as AwsRoleTrustProviderOptions
    )

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("retries retryable trust provider failures", async () => {
    const signer = vi
      .fn()
      .mockRejectedValueOnce(
        new TrustProviderError("temporary AWS failure", {
          retryable: true
        })
      )
      .mockResolvedValueOnce({
        headers: { host: "sts.us-east-1.amazonaws.com" },
        region: "us-east-1"
      })

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()
    expect(identity).toMatchObject({
      aws: {
        stsGetCallerIdentity: {
          region: "us-east-1"
        }
      }
    })
    expect(signer).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable trust provider failures", async () => {
    const signer = vi.fn().mockRejectedValue(
      new TrustProviderError("invalid AWS credentials", {
        retryable: false
      })
    )

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    expect(signer).toHaveBeenCalledTimes(1)
  })

  it("maps non-sdk signer failures to non-retryable trust provider errors", async () => {
    const signer = vi.fn().mockRejectedValue(new Error("unexpected signer failure"))

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("retries exhausted AWS credential-chain failures", async () => {
    const signer = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not load credentials from any providers"))
      .mockResolvedValueOnce({
        headers: { host: "sts.us-east-1.amazonaws.com" },
        region: "us-east-1"
      })

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()
    expect(identity).toMatchObject({
      aws: {
        stsGetCallerIdentity: {
          region: "us-east-1"
        }
      }
    })
    expect(signer).toHaveBeenCalledTimes(2)
  })

  it("does not retry deterministic credential-shape validation errors", async () => {
    const signer = vi.fn().mockRejectedValue(new Error("AWS credential provider returned an empty accessKeyId"))

    const provider = createAwsRoleTrustProvider({
      region: "us-east-1",
      signer,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const result = await provider.collectIdentity().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    )

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("Expected collectIdentity() to fail for deterministic credential-shape errors")
    }

    expect(result.error).toBeInstanceOf(TrustProviderError)
    expect(result.error).toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
    expect(signer).toHaveBeenCalledTimes(1)
  })
})
