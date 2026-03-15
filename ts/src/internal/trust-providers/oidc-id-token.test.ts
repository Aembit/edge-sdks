import { describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import {
  createOidcIdTokenTrustProvider,
  type OidcIdTokenTrustProviderOptions
} from "./oidc-id-token.js"

describe("createOidcIdTokenTrustProvider", () => {
  it("collects an OIDC identity token from a static string", async () => {
    const provider = createOidcIdTokenTrustProvider({
      identityToken: "token-123"
    })

    const identity = await provider.collectIdentity()

    expect(provider.id).toBe("oidc-id-token")
    expect(provider.kind).toBe("oidc_id_token")
    expect(identity).toEqual({
      oidc: {
        identityToken: "token-123"
      }
    })
  })

  it("uses a custom id when provided", async () => {
    const provider = createOidcIdTokenTrustProvider({
      id: "custom-oidc",
      identityToken: "token-123"
    })

    await provider.collectIdentity()
    expect(provider.id).toBe("custom-oidc")
  })

  it("resolves the token from a sync getter", async () => {
    const identityToken = vi.fn(() => "token-from-getter")

    const provider = createOidcIdTokenTrustProvider({
      identityToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      oidc: {
        identityToken: "token-from-getter"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(1)
  })

  it("resolves the token from an async getter", async () => {
    const identityToken = vi.fn(async () => "token-from-async-getter")

    const provider = createOidcIdTokenTrustProvider({
      identityToken
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      oidc: {
        identityToken: "token-from-async-getter"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(1)
  })

  it("fails with a non-retryable error when the token is empty", async () => {
    const provider = createOidcIdTokenTrustProvider({
      identityToken: "   "
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("does not throw TypeError when options are missing at runtime", async () => {
    const provider = createOidcIdTokenTrustProvider(
      undefined as unknown as OidcIdTokenTrustProviderOptions
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

    const provider = createOidcIdTokenTrustProvider({
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
      oidc: {
        identityToken: "retried-token"
      }
    })
    expect(identityToken).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable token validation failures", async () => {
    const identityToken = vi.fn(() => " ")

    const provider = createOidcIdTokenTrustProvider({
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
    const provider = createOidcIdTokenTrustProvider({
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
