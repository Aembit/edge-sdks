import { afterEach, describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"

function asFetchMock(
  fn: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return fn
}

function getHeaderValue(init: RequestInit | undefined, key: string): string | undefined {
  const headers = init?.headers
  if (!headers) {
    return undefined
  }

  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined
  }

  if (Array.isArray(headers)) {
    const lowerKey = key.toLowerCase()
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue
      }

      const [name, value] = entry
      if (typeof name === "string" && typeof value === "string" && name.toLowerCase() === lowerKey) {
        return value
      }
    }

    return undefined
  }

  const value = isRecord(headers) ? headers[key] : undefined
  return typeof value === "string" ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

describe("createAwsMetadataServiceTrustProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("collects IMDSv2 identity document and signature", async () => {
    const iidDocument =
      `${JSON.stringify({
        accountId: "123456789012",
        region: "us-east-1",
        instanceId: "i-123"
      })}\n`

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("  imds-token-1 \n", { status: 200 }))
      .mockResolvedValueOnce(new Response(iidDocument, { status: 200 }))
      .mockResolvedValueOnce(new Response("signature-abc\n", { status: 200 }))

    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      timeoutMs: 50,
      tokenTtlSeconds: 300
    })

    const identity = await provider.collectIdentity()

    expect(identity).toEqual({
      aws: {
        instanceIdentityDocument: Buffer.from(iidDocument, "utf8").toString("base64"),
        instanceIdentityDocumentSignature: "signature-abc\n"
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [tokenCallUrl, tokenCallInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(tokenCallUrl).pathname).toBe("/latest/api/token")
    expect(tokenCallInit.method).toBe("PUT")
    expect(
      getHeaderValue(tokenCallInit, "x-aws-ec2-metadata-token-ttl-seconds")
    ).toBe("300")

    const [documentCallUrl, documentCallInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(new URL(documentCallUrl).pathname).toBe("/latest/dynamic/instance-identity/document")
    expect(documentCallInit.method).toBe("GET")
    expect(getHeaderValue(documentCallInit, "x-aws-ec2-metadata-token")).toBe(
      "imds-token-1"
    )

    const [signatureCallUrl, signatureCallInit] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(new URL(signatureCallUrl).pathname).toBe("/latest/dynamic/instance-identity/signature")
    expect(signatureCallInit.method).toBe("GET")
    expect(getHeaderValue(signatureCallInit, "x-aws-ec2-metadata-token")).toBe(
      "imds-token-1"
    )
  })

  it("maps non-retryable IMDS HTTP failures", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider()
    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      statusCode: 401,
      retryable: false
    })
  })

  it("fails when IMDS token response is whitespace only", async () => {
    const fetchMock = vi.fn(async () => new Response(" \n\t ", { status: 200 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      retry: {
        enabled: false
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
  })

  it("retries retryable IMDS failures and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 500 }))
      .mockResolvedValueOnce(new Response("imds-token-2", { status: 200 }))
      .mockResolvedValueOnce(new Response("{\"instanceId\":\"i-123\"}", { status: 200 }))
      .mockResolvedValueOnce(new Response("signature-xyz", { status: 200 }))

    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(identity).toMatchObject({
      aws: {
        instanceIdentityDocumentSignature: "signature-xyz"
      }
    })
  })

  it("retries configured retryable IMDS status codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("conflict", { status: 409 }))
      .mockResolvedValueOnce(new Response("imds-token-2", { status: 200 }))
      .mockResolvedValueOnce(new Response("{\"instanceId\":\"i-123\"}", { status: 200 }))
      .mockResolvedValueOnce(new Response("signature-xyz", { status: 200 }))

    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
        retryableStatusCodes: [409]
      }
    })

    const identity = await provider.collectIdentity()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(identity).toMatchObject({
      aws: {
        instanceIdentityDocumentSignature: "signature-xyz"
      }
    })
  })

  it("maps timeout failures as retryable trust provider errors", async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"))
          })
        })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      timeoutMs: 10,
      retry: {
        enabled: false
      }
    })

    const settled = provider.collectIdentity().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    )
    await vi.advanceTimersByTimeAsync(10)

    const result = await settled
    if (result.ok) {
      throw new Error("Expected collectIdentity() to fail on timeout")
    }

    expect(result.error).toBeInstanceOf(TrustProviderError)
    expect(result.error).toMatchObject({
      kind: "trust_provider",
      retryable: true
    })
  })

  it("maps invalid IMDS baseUrl failures as non-retryable", async () => {
    const fetchMock = vi.fn(async () => new Response("token-1", { status: 200 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      baseUrl: "http://[::1",
      retry: {
        maxAttempts: 5,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it("clamps positive fractional timeoutMs to at least 1ms", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("token-1", { status: 200 }))
      .mockResolvedValueOnce(new Response("{\"instanceId\":\"i-123\"}", { status: 200 }))
      .mockResolvedValueOnce(new Response("sig-1", { status: 200 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAwsMetadataServiceTrustProvider({
      timeoutMs: 0.5
    })

    const identity = await provider.collectIdentity()
    expect(identity).toMatchObject({
      aws: {
        instanceIdentityDocumentSignature: "sig-1"
      }
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
