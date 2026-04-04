import { describe, expect, it } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import { createTokenTrustProviderClass } from "./token-trust-provider.js"

const TestTokenTrustProvider = createTokenTrustProviderClass({
  defaultId: "test-token-provider",
  kind: "test_token_provider",
  subjectKey: "test",
  authCacheKeyPrefix: "test",
  errorLabel: "Test Token Trust Provider"
})

describe("createTokenTrustProviderClass", () => {
  it("returns a stable single-flight key for static token strings", () => {
    const provider = new TestTokenTrustProvider({
      id: "custom-provider",
      identityToken: "token-123"
    })

    expect(provider.getIdentitySingleFlightKey?.()).toBe("test_token_provider:custom-provider")
  })

  it("does not return a single-flight key for dynamic token sources", () => {
    const provider = new TestTokenTrustProvider({
      identityToken: () => "token-123"
    })

    expect(provider.getIdentitySingleFlightKey?.()).toBeUndefined()
  })

  it("fails with a non-retryable error when token configuration is missing", async () => {
    const provider = new TestTokenTrustProvider()

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("fails with a non-retryable error when the resolved token is empty", async () => {
    const provider = new TestTokenTrustProvider({
      identityToken: "   "
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("maps unexpected token-source failures to retryable trust provider errors", async () => {
    const provider = new TestTokenTrustProvider({
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

  it("returns auth cache metadata with the configured prefix", async () => {
    const provider = new TestTokenTrustProvider({
      identityToken: "token-123"
    })

    const identity = await provider.collectIdentityWithMetadata?.()

    expect(identity).toMatchObject({
      client: {
        test: {
          identityToken: "token-123"
        }
      }
    })
    expect(identity?.authCacheKey).toMatch(/^test:/)
  })
})
