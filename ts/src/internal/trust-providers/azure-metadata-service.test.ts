import { afterEach, describe, expect, it, vi } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import { createAzureMetadataServiceTrustProvider } from "./azure-metadata-service.js"

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

describe("createAzureMetadataServiceTrustProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("collects Azure IMDS attested data", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          encoding: "pkcs7",
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      timeoutMs: 50,
      apiVersion: "2025-04-07",
      nonce: () => "1234567890"
    })

    const identity = await provider.collectIdentity()

    expect(provider.id).toBe("azure-metadata-service")
    expect(provider.kind).toBe("azure_metadata_service")
    expect(identity).toEqual({
      azure: {
        attestedDocument: {
          encoding: "pkcs7",
          signature: "signature-abc",
          nonce: "1234567890"
        }
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    if (!firstCall) {
      throw new Error("Expected Azure IMDS fetch to be called")
    }

    const requestUrl = (firstCall as unknown[])[0] as string
    const requestInit = (firstCall as unknown[])[1] as RequestInit
    const url = new URL(requestUrl)
    expect(url.pathname).toBe("/metadata/attested/document")
    expect(url.searchParams.get("api-version")).toBe("2025-04-07")
    expect(url.searchParams.get("nonce")).toBe("1234567890")
    expect(requestInit.method).toBe("GET")
    expect(getHeaderValue(requestInit, "Metadata")).toBe("true")
  })

  it("uses a custom id when provided", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      id: "custom-azure",
      nonce: () => "1234567890"
    })

    await provider.collectIdentity()
    expect(provider.id).toBe("custom-azure")
  })

  it("defaults attested document encoding to pkcs7 when omitted", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890"
    })

    const identity = await provider.collectIdentity()
    expect(identity).toEqual({
      azure: {
        attestedDocument: {
          encoding: "pkcs7",
          signature: "signature-abc",
          nonce: "1234567890"
        }
      }
    })
  })

  it("maps non-retryable IMDS HTTP failures", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890"
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      statusCode: 401,
      retryable: false
    })
  })

  it("fails when the attested document response is malformed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify("bad"), { status: 200 }))
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890",
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

  it("fails when the attested document signature is empty", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: " \n\t "
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890",
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

  it("fails when the nonce is not a 10-digit string", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "invalid"
    })

    await expect(provider.collectIdentity()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(provider.collectIdentity()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it("retries retryable IMDS failures and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signature: "signature-xyz"
          }),
          { status: 200 }
        )
      )

    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890",
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    })

    const identity = await provider.collectIdentity()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(identity).toMatchObject({
      azure: {
        attestedDocument: {
          signature: "signature-xyz"
        }
      }
    })
  })

  it("retries configured retryable IMDS status codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("conflict", { status: 409 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signature: "signature-xyz"
          }),
          { status: 200 }
        )
      )

    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      nonce: () => "1234567890",
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false,
        retryableStatusCodes: [409]
      }
    })

    const identity = await provider.collectIdentity()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(identity).toMatchObject({
      azure: {
        attestedDocument: {
          signature: "signature-xyz"
        }
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

    const provider = createAzureMetadataServiceTrustProvider({
      timeoutMs: 10,
      nonce: () => "1234567890",
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
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      baseUrl: "http://[::1",
      nonce: () => "1234567890",
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
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          signature: "signature-abc"
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const provider = createAzureMetadataServiceTrustProvider({
      timeoutMs: 0.5,
      nonce: () => "1234567890"
    })

    const identity = await provider.collectIdentity()
    expect(identity).toMatchObject({
      azure: {
        attestedDocument: {
          signature: "signature-abc"
        }
      }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
