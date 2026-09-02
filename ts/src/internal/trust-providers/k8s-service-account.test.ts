// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import {
  createK8sServiceAccountTrustProvider,
  type K8sServiceAccountTrustProviderOptions
} from "./k8s-service-account.js"

describe("createK8sServiceAccountTrustProvider", () => {
  it("collects a Kubernetes service account token from a static string", async () => {
    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken: "token-123"
    })

    const identity = await provider.collectIdentity()

    expect(provider.id).toBe("k8s-service-account")
    expect(provider.kind).toBe("k8s_service_account")
    expect(identity).toEqual({
      k8s: {
        serviceAccountToken: "token-123"
      }
    })
  })

  it("uses a custom id when provided", async () => {
    const provider = createK8sServiceAccountTrustProvider({
      id: "custom-k8s",
      serviceAccountToken: "token-123"
    })

    await provider.collectIdentity()
    expect(provider.id).toBe("custom-k8s")
  })

  it("resolves the token from a sync getter", async () => {
    const serviceAccountToken = vi.fn(() => "token-from-getter")

    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      k8s: {
        serviceAccountToken: "token-from-getter"
      }
    })
    expect(serviceAccountToken).toHaveBeenCalledTimes(1)
  })

  it("resolves the token from an async getter", async () => {
    const serviceAccountToken = vi.fn(async () => "token-from-async-getter")

    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      k8s: {
        serviceAccountToken: "token-from-async-getter"
      }
    })
    expect(serviceAccountToken).toHaveBeenCalledTimes(1)
  })

  it("returns auth cache metadata for the resolved token", async () => {
    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken: "token-123"
    })

    const identity = await provider.collectIdentityWithMetadata?.()

    expect(identity).toMatchObject({
      client: {
        k8s: {
          serviceAccountToken: "token-123"
        }
      }
    })
    expect(identity?.authCacheKey).toMatch(/^k8s:/)
  })

  it("fails with a non-retryable error when the token is empty", async () => {
    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken: "   "
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("does not throw TypeError when options are missing at runtime", async () => {
    const provider = createK8sServiceAccountTrustProvider(
      undefined as unknown as K8sServiceAccountTrustProviderOptions
    )

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("retries retryable token resolution failures", async () => {
    const serviceAccountToken = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary file read failure"))
      .mockResolvedValueOnce("retried-token")

    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      k8s: {
        serviceAccountToken: "retried-token"
      }
    })
    expect(serviceAccountToken).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable token validation failures", async () => {
    const serviceAccountToken = vi.fn(() => " ")

    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken,
      retry: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    expect(serviceAccountToken).toHaveBeenCalledTimes(1)
  })

  it("maps unexpected token-source failures to retryable trust provider errors", async () => {
    const provider = createK8sServiceAccountTrustProvider({
      serviceAccountToken: () => {
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
