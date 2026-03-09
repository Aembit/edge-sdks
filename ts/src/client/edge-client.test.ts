import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthError, CredentialError, TrustProviderError } from "../internal/protocol/errors.js"
import type { TrustProvider } from "../types/trust-provider.js"
import { EdgeClient } from "./edge-client.js"

function asFetchMock(
  fn: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return fn as unknown as typeof fetch
}

function parseRequestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
  const [, init] = fetchMock.mock.calls[callIndex]
  const body = (init as RequestInit).body
  if (typeof body !== "string") {
    return undefined
  }

  return JSON.parse(body)
}

function getRequestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number
): Record<string, string> {
  const [, init] = fetchMock.mock.calls[callIndex]
  return ((init as RequestInit).headers ?? {}) as Record<string, string>
}

function getRequestPath(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const [url] = fetchMock.mock.calls[callIndex]
  return new URL(String(url)).pathname
}

function createTrustProvider(
  collectIdentity: () => Promise<Record<string, unknown>>
): TrustProvider {
  return {
    id: "tp-1",
    kind: "aws_metadata_service",
    collectIdentity
  }
}

describe("EdgeClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("authenticate() updates session state without returning raw access token", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: "token-1",
          tokenType: "Bearer",
          expiresIn: 120
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    const session = await client.authenticate()

    expect(session.authenticated).toBe(true)
    expect(session.trustProviderId).toBe("tp-1")
    expect(session.expiresAt).toMatch(/T/)
    expect(Object.prototype.hasOwnProperty.call(session, "accessToken")).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getRequestPath(fetchMock, 0)).toBe("/edge/v1/auth")
    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: { aws: { instanceIdentityDocument: "doc" } }
    })
  })

  it("rejects malformed expiresIn from auth response", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: "token-invalid-expiry",
          tokenType: "Bearer",
          expiresIn: -1
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    await expect(client.authenticate()).rejects.toBeInstanceOf(AuthError)
    await expect(client.authenticate()).rejects.toMatchObject({
      kind: "auth",
      retryable: false
    })
  })

  it("getCredential() auto-authenticates and defaults transportProtocol to TCP", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-2",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "abc" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    const result = await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })

    expect(result).toEqual({
      credentialType: "ApiKey",
      expiresAt: null,
      data: { apiKey: "abc" }
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getRequestPath(fetchMock, 0)).toBe("/edge/v1/auth")
    expect(getRequestPath(fetchMock, 1)).toBe("/edge/v1/credentials")
    expect(parseRequestBody(fetchMock, 1)).toEqual({
      client: { aws: { instanceIdentityDocument: "doc" } },
      server: {
        host: "db.internal",
        port: 443,
        transportProtocol: "TCP"
      },
      credentialType: "ApiKey"
    })
  })

  it("reuses cached auth token for subsequent getCredential() calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-3",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "x" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await client.getCredential({ server: { host: "db.internal", port: 443 } })
    await client.getCredential({ server: { host: "db.internal", port: 443 } })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))).toEqual([
      "/edge/v1/auth",
      "/edge/v1/credentials",
      "/edge/v1/credentials"
    ])
  })

  it("uses auth expiry skew and refreshes token before edge expiry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-09T12:00:00Z"))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-4a",
            tokenType: "Bearer",
            expiresIn: 30
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "a" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-4b",
            tokenType: "Bearer",
            expiresIn: 30
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "b" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await client.getCredential({ server: { host: "db.internal", port: 443 } })
    await client.getCredential({ server: { host: "db.internal", port: 443 } })

    const authPaths = fetchMock.mock.calls
      .map((_, idx) => getRequestPath(fetchMock, idx))
      .filter((path) => path === "/edge/v1/auth")
    expect(authPaths).toHaveLength(2)
  })

  it("deduplicates concurrent authentication with a single in-flight auth call", async () => {
    let resolveAuth: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: unknown) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        return new Promise<Response>((resolve) => {
          resolveAuth = resolve
        })
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "k" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    const first = client.getCredential({ server: { host: "db.internal", port: 443 } })
    const second = client.getCredential({ server: { host: "db.internal", port: 443 } })

    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock.mock.calls.filter((_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth")).toHaveLength(1)

    resolveAuth?.(
      new Response(
        JSON.stringify({
          accessToken: "token-5",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.data).toEqual({ apiKey: "k" })
    expect(secondResult.data).toEqual({ apiKey: "k" })

    const paths = fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))
    expect(paths.filter((path) => path === "/edge/v1/auth")).toHaveLength(1)
    expect(paths.filter((path) => path === "/edge/v1/credentials")).toHaveLength(2)
  })

  it("wraps Trust Provider failures as TrustProviderError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: "unused",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => {
        throw new Error("identity unavailable")
      })
    })

    await expect(client.authenticate()).rejects.toBeInstanceOf(TrustProviderError)
    await expect(client.authenticate()).rejects.toMatchObject({
      kind: "trust_provider",
      retryable: false
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fails fast for invalid server input before authentication", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await expect(
      client.getCredential({
        server: {
          host: " ",
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(collectIdentity).not.toHaveBeenCalled()
  })

  it("maps non-string server.host to CredentialError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await expect(
      client.getCredential({
        server: {
          host: 123 as unknown as string,
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(collectIdentity).not.toHaveBeenCalled()
  })

  it("maps null server input to CredentialError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi.fn(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await expect(
      client.getCredential({
        server: null as unknown as { host: string; port: number }
      })
    ).rejects.toBeInstanceOf(CredentialError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(collectIdentity).not.toHaveBeenCalled()
  })

  it("maps undefined getCredential input to CredentialError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    await expect(
      client.getCredential(undefined as unknown as { server: { host: string; port: number } })
    ).rejects.toBeInstanceOf(CredentialError)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("maps null getCredential options to CredentialError", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    await expect(
      client.getCredential(
        { server: { host: "db.internal", port: 443 } },
        null as unknown as Record<string, never>
      )
    ).rejects.toBeInstanceOf(CredentialError)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("applies per-call resourceSet override to auth and credentials requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-6",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "z" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
      resourceSet: "default-rs"
    })

    await client.getCredential(
      {
        server: {
          host: "db.internal",
          port: 443
        }
      },
      {
        resourceSet: "override-rs"
      }
    )

    expect(getRequestHeaders(fetchMock, 0)["x-aembit-resourceset"]).toBe("override-rs")
    expect(getRequestHeaders(fetchMock, 1)["x-aembit-resourceset"]).toBe("override-rs")
  })

  it("preserves cached token when forced authenticate() refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-7",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "ok" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const collectIdentity = vi
      .fn<() => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({ aws: { instanceIdentityDocument: "doc" } })
      .mockRejectedValueOnce(new Error("temporary provider issue"))
      .mockResolvedValueOnce({ aws: { instanceIdentityDocument: "doc" } })

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(collectIdentity)
    })

    await client.authenticate()
    await expect(client.authenticate()).rejects.toBeInstanceOf(TrustProviderError)

    const credential = await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      }
    })
    expect(credential.data).toEqual({ apiKey: "ok" })

    const paths = fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))
    expect(paths).toEqual(["/edge/v1/auth", "/edge/v1/credentials"])
  })

  it("does not cache malformed-expiry auth token for later getCredential()", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-bad",
            tokenType: "Bearer",
            expiresIn: -1
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-good",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "ok" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    await expect(client.authenticate()).rejects.toBeInstanceOf(AuthError)
    const credential = await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      }
    })

    expect(credential.data).toEqual({ apiKey: "ok" })
    const paths = fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))
    expect(paths).toEqual([
      "/edge/v1/auth",
      "/edge/v1/auth",
      "/edge/v1/credentials"
    ])
  })

  it("re-authenticates when per-call resourceSet changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-a",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "a" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-b",
            tokenType: "Bearer",
            expiresIn: 3600
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            credentialType: "ApiKey",
            expiresAt: null,
            data: { apiKey: "b" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
      resourceSet: "rs-a"
    })

    await client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-a" }
    )
    await client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-b" }
    )

    const paths = fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))
    expect(paths).toEqual([
      "/edge/v1/auth",
      "/edge/v1/credentials",
      "/edge/v1/auth",
      "/edge/v1/credentials"
    ])
  })

  it("does not share in-flight auth across different resource sets", async () => {
    let resolveAuthA: ((value: Response) => void) | undefined
    let resolveAuthB: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        const headers = (init?.headers ?? {}) as Record<string, string>
        const resourceSet = headers["x-aembit-resourceset"]
        if (resourceSet === "rs-a") {
          return new Promise<Response>((resolve) => {
            resolveAuthA = resolve
          })
        }

        if (resourceSet === "rs-b") {
          return new Promise<Response>((resolve) => {
            resolveAuthB = resolve
          })
        }

        return Promise.reject(new Error(`unexpected auth resourceSet: ${resourceSet}`))
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error(`unexpected path: ${path}`))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    const first = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-a" }
    )
    const second = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-b" }
    )

    await Promise.resolve()
    await Promise.resolve()

    const authCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth"
    )
    expect(authCalls).toHaveLength(2)

    resolveAuthA?.(
      new Response(
        JSON.stringify({
          accessToken: "token-a",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    resolveAuthB?.(
      new Response(
        JSON.stringify({
          accessToken: "token-b",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    await Promise.all([first, second])

    const credentialCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/credentials"
    )
    expect(credentialCalls).toHaveLength(2)
    const credentialHeaders = credentialCalls.map(
      ([, init]) => ((init as RequestInit).headers ?? {}) as Record<string, string>
    )
    expect(credentialHeaders.map((headers) => headers["x-aembit-resourceset"]).sort()).toEqual([
      "rs-a",
      "rs-b"
    ])
    expect(credentialHeaders.map((headers) => headers.authorization).sort()).toEqual([
      "Bearer token-a",
      "Bearer token-b"
    ])
  })

  it("does not clear a valid token when concurrent auth fails for another resource set", async () => {
    let resolveAuthA: ((value: Response) => void) | undefined
    let rejectAuthB: ((reason?: unknown) => void) | undefined
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        const headers = (init?.headers ?? {}) as Record<string, string>
        const resourceSet = headers["x-aembit-resourceset"]
        if (resourceSet === "rs-a") {
          return new Promise<Response>((resolve) => {
            resolveAuthA = resolve
          })
        }

        if (resourceSet === "rs-b") {
          return new Promise<Response>((_, reject) => {
            rejectAuthB = reject
          })
        }
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error("unexpected request"))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
      retry: { enabled: false }
    })

    const successCredential = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-a" }
    )
    const failedCredential = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-b" }
    )

    await Promise.resolve()
    await Promise.resolve()

    resolveAuthA?.(
      new Response(
        JSON.stringify({
          accessToken: "token-a",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    rejectAuthB?.(new Error("simulated rs-b auth failure"))

    await expect(failedCredential).rejects.toMatchObject({ kind: "transport" })
    await expect(successCredential).resolves.toMatchObject({
      data: { apiKey: "ok" }
    })

    const reusedCredential = await client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-a" }
    )
    expect(reusedCredential.data).toEqual({ apiKey: "ok" })

    const paths = fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))
    expect(paths.filter((path) => path === "/edge/v1/auth")).toHaveLength(2)
    expect(paths.filter((path) => path === "/edge/v1/credentials")).toHaveLength(2)
  })

  it("does not collide undefined resourceSet with literal '__default__'", async () => {
    let resolveDefault: ((value: Response) => void) | undefined
    let resolveLiteral: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        const headers = (init?.headers ?? {}) as Record<string, string>
        const resourceSet = headers["x-aembit-resourceset"]
        if (resourceSet === undefined) {
          return new Promise<Response>((resolve) => {
            resolveDefault = resolve
          })
        }

        if (resourceSet === "__default__") {
          return new Promise<Response>((resolve) => {
            resolveLiteral = resolve
          })
        }
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error("unexpected request"))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    const first = client.getCredential({ server: { host: "db.internal", port: 443 } })
    const second = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "__default__" }
    )

    await Promise.resolve()
    await Promise.resolve()

    const authCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth"
    )
    expect(authCalls).toHaveLength(2)

    resolveDefault?.(
      new Response(
        JSON.stringify({
          accessToken: "token-default",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    resolveLiteral?.(
      new Response(
        JSON.stringify({
          accessToken: "token-literal",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    await Promise.all([first, second])
  })

  it("deduplicates concurrent authenticate() and getCredential() for same effective resource set", async () => {
    let resolveAuth: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: unknown) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        return new Promise<Response>((resolve) => {
          resolveAuth = resolve
        })
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error("unexpected request"))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
      resourceSet: "rs-config"
    })

    const auth = client.authenticate()
    const credential = client.getCredential({ server: { host: "db.internal", port: 443 } })

    await Promise.resolve()
    await Promise.resolve()

    const authCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth"
    )
    expect(authCalls).toHaveLength(1)

    resolveAuth?.(
      new Response(
        JSON.stringify({
          accessToken: "token-shared",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    await Promise.all([auth, credential])
  })

  it("does not deduplicate in-flight auth when retry overrides differ", async () => {
    let resolveAuthA: ((value: Response) => void) | undefined
    let resolveAuthB: ((value: Response) => void) | undefined
    let authCallCount = 0

    const fetchMock = vi.fn((input: unknown) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        authCallCount += 1
        if (authCallCount === 1) {
          return new Promise<Response>((resolve) => {
            resolveAuthA = resolve
          })
        }

        return new Promise<Response>((resolve) => {
          resolveAuthB = resolve
        })
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error("unexpected request"))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    const first = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-1", retry: { enabled: false } }
    )
    const second = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-1", retry: { enabled: true, maxAttempts: 2 } }
    )

    await Promise.resolve()
    await Promise.resolve()

    const authCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth"
    )
    expect(authCalls).toHaveLength(2)

    resolveAuthA?.(
      new Response(
        JSON.stringify({
          accessToken: "token-1",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    resolveAuthB?.(
      new Response(
        JSON.stringify({
          accessToken: "token-2",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    await Promise.all([first, second])
  })

  it("deduplicates in-flight auth when retry overrides are equivalent", async () => {
    let resolveAuth: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: unknown) => {
      const path = new URL(String(input)).pathname
      if (path === "/edge/v1/auth") {
        return new Promise<Response>((resolve) => {
          resolveAuth = resolve
        })
      }

      if (path === "/edge/v1/credentials") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              credentialType: "ApiKey",
              expiresAt: null,
              data: { apiKey: "ok" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      }

      return Promise.reject(new Error("unexpected request"))
    })
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
    })

    const first = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-1", retry: { maxAttempts: 3 } }
    )
    const second = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-1", retry: { maxAttempts: 3 } }
    )

    await Promise.resolve()
    await Promise.resolve()

    const authCalls = fetchMock.mock.calls.filter(
      (_, idx) => getRequestPath(fetchMock, idx) === "/edge/v1/auth"
    )
    expect(authCalls).toHaveLength(1)

    resolveAuth?.(
      new Response(
        JSON.stringify({
          accessToken: "token-shared",
          tokenType: "Bearer",
          expiresIn: 3600
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    await Promise.all([first, second])
  })
})
