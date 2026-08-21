// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthError, CredentialError, TrustProviderError } from "../internal/protocol/errors.js"
import type {
  CollectedTrustProviderIdentity,
  TrustProvider
} from "../types/trust-provider.js"
import { EdgeClient } from "./edge-client.js"

function asFetchMock(
  fn: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return fn
}

function parseRequestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
  const call = fetchMock.mock.calls[callIndex] as [unknown, RequestInit | undefined] | undefined
  if (!call) {
    throw new Error(`Expected mock call at index ${String(callIndex)}`)
  }

  const [, init] = call
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
  const call = fetchMock.mock.calls[callIndex] as [unknown, RequestInit | undefined] | undefined
  if (!call) {
    throw new Error(`Expected mock call at index ${String(callIndex)}`)
  }

  const [, init] = call
  return normalizeHeaders((init as RequestInit).headers)
}

function normalizeHeaders(headers: RequestInit["headers"] | undefined): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!headers) {
    return normalized
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value
    })
    return normalized
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      normalized[key.toLowerCase()] = value
    }
    return normalized
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key.toLowerCase()] = value
    }
  }

  return normalized
}

function getRequestPath(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const call = fetchMock.mock.calls[callIndex] as [unknown] | undefined
  if (!call) {
    throw new Error(`Expected mock call at index ${String(callIndex)}`)
  }

  const [url] = call
  return new URL(String(url)).pathname
}

function createTrustProvider(
  collectIdentity: () => Promise<Record<string, unknown>>,
  collectIdentityWithMetadata?: () => Promise<CollectedTrustProviderIdentity>,
  getIdentitySingleFlightKey?: () => string | undefined
): TrustProvider {
  return {
    id: "tp-1",
    kind: "aws_metadata_service",
    collectIdentity,
    collectIdentityWithMetadata,
    getIdentitySingleFlightKey
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

  it("authenticate() merges additional client workload details into auth payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: "token-merged-auth",
          tokenType: "Bearer",
          expiresIn: 120
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({
        aws: {
          stsGetCallerIdentity: {
            headers: { host: "sts.us-east-1.amazonaws.com" },
            region: "us-east-1"
          }
        }
      })),
      clientWorkloadDetails: {
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: "lambda-workload-1"
          }
        }
      }
    })

    await client.authenticate()

    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: {
        aws: {
          stsGetCallerIdentity: {
            headers: { host: "sts.us-east-1.amazonaws.com" },
            region: "us-east-1"
          }
        },
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: "lambda-workload-1"
          }
        }
      }
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

  it("rejects malformed auth success payload shape", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("null", {
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

  it("getCredential() merges additional client workload details into auth and credentials payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-merged-credential",
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

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({
        aws: {
          stsGetCallerIdentity: {
            headers: { host: "sts.us-east-1.amazonaws.com" },
            region: "us-east-1"
          }
        }
      })),
      clientWorkloadDetails: {
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: "lambda-workload-1"
          }
        }
      }
    })

    await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })

    const expectedClient = {
      aws: {
        stsGetCallerIdentity: {
          headers: { host: "sts.us-east-1.amazonaws.com" },
          region: "us-east-1"
        }
      },
      os: {
        environment: {
          CLIENT_WORKLOAD_ID: "lambda-workload-1"
        }
      }
    }

    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: expectedClient
    })
    expect(parseRequestBody(fetchMock, 1)).toEqual({
      client: expectedClient,
      server: {
        host: "db.internal",
        port: 443,
        transportProtocol: "TCP"
      },
      credentialType: "ApiKey"
    })
  })

  it("preserves explicit null Trust Provider fields over clientWorkloadDetails", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          accessToken: "token-preserve-null",
          tokenType: "Bearer",
          expiresIn: 120
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(async () => ({
        aws: {
          stsGetCallerIdentity: {
            headers: { host: "sts.us-east-1.amazonaws.com" },
            region: "us-east-1"
          }
        },
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: null
          }
        }
      })),
      clientWorkloadDetails: {
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: "lambda-workload-1"
          }
        }
      }
    })

    await client.authenticate()

    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: {
        aws: {
          stsGetCallerIdentity: {
            headers: { host: "sts.us-east-1.amazonaws.com" },
            region: "us-east-1"
          }
        },
        os: {
          environment: {
            CLIENT_WORKLOAD_ID: null
          }
        }
      }
    })
  })

  it("rejects malformed credential success payload shape", async () => {
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
        new Response("null", {
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
      client.getCredential({
        server: {
          host: "db.internal",
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)
  })

  it("rejects credential success payload when data is not an object", async () => {
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
            data: "not-an-object"
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

    await expect(
      client.getCredential({
        server: {
          host: "db.internal",
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)
  })

  it("rejects credential success payload when expiresAt has invalid type", async () => {
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
            expiresAt: 123,
            data: { apiKey: "abc" }
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

    await expect(
      client.getCredential({
        server: {
          host: "db.internal",
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)
  })

  it("rejects credential success payload when credentialType has invalid type", async () => {
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
            credentialType: 123,
            expiresAt: null,
            data: { apiKey: "abc" }
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

    await expect(
      client.getCredential({
        server: {
          host: "db.internal",
          port: 443
        }
      })
    ).rejects.toBeInstanceOf(CredentialError)
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

  it("does not reuse cached auth token when trust-provider auth cache key changes", async () => {
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

    const collectedIdentities: CollectedTrustProviderIdentity[] = [
      {
        client: {
          oidc: {
            identityToken: "token-source-a"
          }
        },
        authCacheKey: "oidc:cache-a"
      },
      {
        client: {
          oidc: {
            identityToken: "token-source-b"
          }
        },
        authCacheKey: "oidc:cache-b"
      }
    ]

    const collectIdentityWithMetadata = vi.fn(async () => {
      const identity = collectedIdentities.shift()
      if (!identity) {
        throw new Error("No more collected identities available")
      }

      return identity
    })

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(
        async () => ({
          oidc: {
            identityToken: "unused"
          }
        }),
        collectIdentityWithMetadata
      )
    })

    const firstCredential = await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })
    const secondCredential = await client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })

    expect(firstCredential.data).toEqual({ apiKey: "a" })
    expect(secondCredential.data).toEqual({ apiKey: "b" })
    expect(fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))).toEqual([
      "/edge/v1/auth",
      "/edge/v1/credentials",
      "/edge/v1/auth",
      "/edge/v1/credentials"
    ])
    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: {
        oidc: {
          identityToken: "token-source-a"
        }
      }
    })
    expect(parseRequestBody(fetchMock, 1)).toEqual({
      client: {
        oidc: {
          identityToken: "token-source-a"
        }
      },
      server: {
        host: "db.internal",
        port: 443,
        transportProtocol: "TCP"
      },
      credentialType: "ApiKey"
    })
    expect(parseRequestBody(fetchMock, 2)).toEqual({
      clientId: "client-id",
      client: {
        oidc: {
          identityToken: "token-source-b"
        }
      }
    })
    expect(parseRequestBody(fetchMock, 3)).toEqual({
      client: {
        oidc: {
          identityToken: "token-source-b"
        }
      },
      server: {
        host: "db.internal",
        port: 443,
        transportProtocol: "TCP"
      },
      credentialType: "ApiKey"
    })
    expect(collectIdentityWithMetadata).toHaveBeenCalledTimes(2)
  })

  it("reuses in-flight stable identity collection across concurrent credential requests", async () => {
    let resolveIdentity:
      | ((identity: CollectedTrustProviderIdentity) => void)
      | undefined
    const identityPromise = new Promise<CollectedTrustProviderIdentity>((resolve) => {
      resolveIdentity = resolve
    })

    const collectIdentityWithMetadata = vi.fn(() => identityPromise)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "token-shared",
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
            data: { apiKey: "shared" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", asFetchMock(fetchMock))

    const client = new EdgeClient({
      baseUrl: "https://tenant.aembit.io",
      clientId: "client-id",
      trustProvider: createTrustProvider(
        async () => ({
          aws: {
            instanceIdentityDocument: "unused"
          }
        }),
        collectIdentityWithMetadata,
        () => "stable:tp-1"
      )
    })

    const firstRequest = client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })
    const secondRequest = client.getCredential({
      server: {
        host: "db.internal",
        port: 443
      },
      credentialType: "ApiKey"
    })

    expect(collectIdentityWithMetadata).toHaveBeenCalledTimes(1)
    resolveIdentity?.({
      client: {
        aws: {
          instanceIdentityDocument: "doc"
        }
      },
      authCacheKey: "aws:stable"
    })

    const [firstCredential, secondCredential] = await Promise.all([
      firstRequest,
      secondRequest
    ])

    expect(firstCredential.data).toEqual({ apiKey: "shared" })
    expect(secondCredential.data).toEqual({ apiKey: "shared" })
    expect(fetchMock.mock.calls.map((_, idx) => getRequestPath(fetchMock, idx))).toEqual([
      "/edge/v1/auth",
      "/edge/v1/credentials",
      "/edge/v1/credentials"
    ])
    expect(parseRequestBody(fetchMock, 0)).toEqual({
      clientId: "client-id",
      client: {
        aws: {
          instanceIdentityDocument: "doc"
        }
      }
    })
    expect(collectIdentityWithMetadata).toHaveBeenCalledTimes(1)
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

  it("wraps identity single-flight key failures as TrustProviderError", async () => {
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
      trustProvider: createTrustProvider(
        async () => ({ aws: { instanceIdentityDocument: "doc" } }),
        undefined,
        () => {
          throw new Error("single-flight key unavailable")
        }
      )
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
        const headers = normalizeHeaders(init?.headers)
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
      ([, init]) => normalizeHeaders((init as RequestInit).headers)
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
        const headers = normalizeHeaders(init?.headers)
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
        const headers = normalizeHeaders(init?.headers)
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

  it("deduplicates in-flight auth for undefined retry and equivalent default override", async () => {
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
      { resourceSet: "rs-1" }
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

  it("deduplicates in-flight auth for undefined retry and empty override", async () => {
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
      { resourceSet: "rs-1" }
    )
    const second = client.getCredential(
      { server: { host: "db.internal", port: 443 } },
      { resourceSet: "rs-1", retry: {} }
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
