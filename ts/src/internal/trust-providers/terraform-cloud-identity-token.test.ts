// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import {
  createTerraformCloudIdentityTokenTrustProvider,
  type TerraformCloudIdentityTokenTrustProviderOptions
} from "./terraform-cloud-identity-token.js"

describe("createTerraformCloudIdentityTokenTrustProvider", () => {
  it("collects a Terraform Cloud identity token from a static string", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken: "token-123"
    })

    const identity = await provider.collectIdentity()

    expect(provider.id).toBe("terraform-cloud-identity-token")
    expect(provider.kind).toBe("terraform_cloud_identity_token")
    expect(identity).toEqual({
      terraform: {
        identityToken: "token-123"
      }
    })
  })

  it("uses a custom id when provided", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider({
      id: "custom-terraform",
      identityToken: "token-123"
    })

    await provider.collectIdentity()
    expect(provider.id).toBe("custom-terraform")
  })

  it("resolves the token from a sync getter", async () => {
    const identityToken = vi.fn(() => "token-from-getter")

    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      terraform: {
        identityToken: "token-from-getter"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(1)
  })

  it("resolves the token from an async getter", async () => {
    const identityToken = vi.fn(async () => "token-from-async-getter")

    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      terraform: {
        identityToken: "token-from-async-getter"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(1)
  })

  it("returns auth cache metadata for the resolved token", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken: "token-123"
    })

    const identity = await provider.collectIdentityWithMetadata?.()

    expect(identity).toMatchObject({
      client: {
        terraform: {
          identityToken: "token-123"
        }
      }
    })
    expect(identity?.authCacheKey).toMatch(/^terraform:/)
  })

  it("fails with a non-retryable error when the token is empty", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken: "   "
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("does not throw TypeError when options are missing at runtime", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider(
      undefined as unknown as TerraformCloudIdentityTokenTrustProviderOptions
    )

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("retries retryable token resolution failures", async () => {
    const identityToken = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary token fetch failure"))
      .mockResolvedValueOnce("retried-token")

    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      terraform: {
        identityToken: "retried-token"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable token validation failures", async () => {
    const identityToken = vi.fn(() => " ")

    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    expect(identityToken).toHaveBeenCalledTimes(1)
  })

  it("maps unexpected token-source failures to retryable trust provider errors", async () => {
    const provider = createTerraformCloudIdentityTokenTrustProvider({
      identityToken: () => {
        throw new Error("unexpected token source failure")
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: true
    })
  })
})
