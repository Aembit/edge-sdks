// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthError, CredentialError, TrustProviderError } from "../internal/protocol/errors.js"
import type { AembitLogger } from "../types/logger.js"
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

  describe("Logging integration", () => {
    it("calls injected logger methods during authenticate and getCredential", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "secret-token-value",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        if (path === "/edge/v1/credentials") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                credentialType: "ApiKey",
                expiresAt: "2030-01-01T00:00:00Z",
                data: { secretKey: "super-secret-password" }
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const debugSpy = vi.fn()
      const infoSpy = vi.fn()
      const warnSpy = vi.fn()
      const errorSpy = vi.fn()

      const mockLogger: AembitLogger = {
        debug: debugSpy,
        info: infoSpy,
        warn: warnSpy,
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
        logger: mockLogger
      })

      // Constructor logging
      expect(debugSpy).toHaveBeenCalledWith(
        "EdgeClient initialized",
        expect.objectContaining({
          baseUrl: "https://tenant.aembit.io",
          clientId: "client-id",
          trustProviderId: "tp-1"
        })
      )

      // Authenticate
      const session = await client.authenticate()
      expect(session.authenticated).toBe(true)
      expect(infoSpy).toHaveBeenCalledWith(
        "Authenticating workload",
        expect.objectContaining({ clientId: "client-id", trustProviderId: "tp-1" })
      )
      expect(infoSpy).toHaveBeenCalledWith(
        "Workload authenticated successfully",
        expect.objectContaining({ trustProviderId: "tp-1" })
      )

      // First getCredential (token cache hit from authenticate)
      const cred1 = await client.getCredential({
        server: { host: "db.internal", port: 443 },
        credentialType: "ApiKey"
      })
      expect(cred1.credentialType).toBe("ApiKey")
      expect(infoSpy).toHaveBeenCalledWith(
        "Retrieving credential",
        expect.objectContaining({ server: "db.internal:443", credentialType: "ApiKey" })
      )
      expect(debugSpy).toHaveBeenCalledWith(
        "Reusing valid cached access token",
        expect.any(Object)
      )
      expect(infoSpy).toHaveBeenCalledWith(
        "Credential retrieved successfully",
        expect.objectContaining({ credentialType: "ApiKey" })
      )

      // Ensure NO sensitive tokens or secret payload values were passed to logger
      const allCalls = [
        ...debugSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls
      ]

      for (const call of allCalls) {
        const serialized = JSON.stringify(call)
        expect(serialized).not.toContain("secret-token-value")
        expect(serialized).not.toContain("super-secret-password")
      }
    })

    it("logs error details when credential retrieval fails", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "token-1",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        if (path === "/edge/v1/credentials") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: "server_not_found",
                message: "Target server is unknown"
              }),
              { status: 404, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const errorSpy = vi.fn()
      const mockLogger: AembitLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
        logger: mockLogger
      })

      await expect(
        client.getCredential({ server: { host: "unknown.internal", port: 443 } })
      ).rejects.toThrow()

      expect(errorSpy).toHaveBeenCalledWith(
        "Credential retrieval failed",
        expect.objectContaining({ server: "unknown.internal:443" })
      )
    })

    it("does not fail SDK operations when logger throws", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "token-1",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        if (path === "/edge/v1/credentials") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                credentialType: "ApiKey",
                expiresAt: null,
                data: { apiKey: "key-1" }
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const throwingLogger: AembitLogger = {
        debug: () => {
          throw new Error("Logger bug")
        },
        info: () => {
          throw new Error("Logger bug")
        },
        warn: () => {
          throw new Error("Logger bug")
        },
        error: () => {
          throw new Error("Logger bug")
        }
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
        logger: throwingLogger
      })

      const session = await client.authenticate()
      expect(session.authenticated).toBe(true)

      const cred = await client.getCredential({ server: { host: "db.internal", port: 443 } })
      expect(cred.credentialType).toBe("ApiKey")
    })

    it("logs error when authentication fails and logger is enabled", async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: "invalid_auth", message: "Auth failed" }), {
            status: 401,
            headers: { "content-type": "application/json" }
          })
        )
      )
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const errorSpy = vi.fn()
      const mockLogger: AembitLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } })),
        logger: mockLogger
      })

      await expect(client.authenticate()).rejects.toThrow(AuthError)
      expect(errorSpy).toHaveBeenCalledWith(
        "Authentication request failed",
        expect.objectContaining({ clientId: "client-id" })
      )
    })

    it("logs error with stringified error when collectIdentity fails with non-Error", async () => {
      const errorSpy = vi.fn()
      const mockLogger: AembitLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject("raw rejection string")
        }),
        logger: mockLogger
      })

      await expect(client.authenticate()).rejects.toThrow(TrustProviderError)
      expect(errorSpy).toHaveBeenCalledWith(
        "Trust Provider failed to collect identity",
        expect.objectContaining({ error: "raw rejection string" })
      )
    })

    it("logs error when collectIdentity throws TrustProviderError with logger enabled", async () => {
      const errorSpy = vi.fn()
      const mockLogger: AembitLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => {
          throw new TrustProviderError("OIDC token unavailable", { retryable: false })
        }),
        logger: mockLogger
      })

      await expect(client.authenticate()).rejects.toThrow("OIDC token unavailable")
      expect(errorSpy).toHaveBeenCalledWith(
        "Trust Provider failed to collect identity",
        expect.objectContaining({
          trustProviderId: "tp-1",
          error: "OIDC token unavailable"
        })
      )
    })

    it("logs error and wraps in TrustProviderError when collectIdentity throws generic error with logger enabled", async () => {
      const errorSpy = vi.fn()
      const mockLogger: AembitLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: errorSpy
      }

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => {
          throw new Error("Local filesystem error")
        }),
        logger: mockLogger
      })

      await expect(client.authenticate()).rejects.toThrow(TrustProviderError)
      expect(errorSpy).toHaveBeenCalledWith(
        "Trust Provider failed to collect identity",
        expect.objectContaining({
          trustProviderId: "tp-1",
          error: "Local filesystem error"
        })
      )
    })

    it("rethrows TrustProviderError when getIdentitySingleFlightKey throws TrustProviderError", async () => {
      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(
          async () => ({ aws: { doc: "doc" } }),
          undefined,
          () => {
            throw new TrustProviderError("Key generation error", { retryable: false })
          }
        )
      })

      await expect(client.authenticate()).rejects.toThrow("Key generation error")
    })

    it("clears cached token state when re-authentication fails with expired token", async () => {
      let authCallCount = 0
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          authCallCount += 1
          if (authCallCount === 1) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  accessToken: "initial-token",
                  tokenType: "Bearer",
                  expiresIn: 1 // expires in 1 second
                }),
                { status: 200, headers: { "content-type": "application/json" } }
              )
            )
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: "invalid_auth",
                message: "Session expired"
              }),
              { status: 401, headers: { "content-type": "application/json" } }
            )
          )
        }
        if (path === "/edge/v1/credentials") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                credentialType: "ApiKey",
                expiresAt: null,
                data: { apiKey: "key-1" }
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { instanceIdentityDocument: "doc" } }))
      })

      // 1. Initial auth succeeds
      await client.authenticate()

      // 2. Advance time past token expiry (1 second + skew)
      vi.setSystemTime(Date.now() + 10000)

      // 3. Second getCredential attempts re-auth, which fails (500)
      await expect(
        client.getCredential({ server: { host: "db.internal", port: 443 } })
      ).rejects.toThrow()

      // 4. Verify token state was cleared (private state check via subsequent auth)
      expect(authCallCount).toBe(2)
      vi.useRealTimers()
    })

    it("validates input when missing server in getCredential", async () => {
      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { doc: "doc" } }))
      })

      // @ts-expect-error testing missing server property
      await expect(client.getCredential({})).rejects.toThrow(
        "getCredential() requires input.server"
      )
    })

    it("validates options when non-object options passed to getCredential", async () => {
      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { doc: "doc" } }))
      })

      // @ts-expect-error testing invalid options type
      await expect(client.getCredential({ server: { host: "db.internal", port: 443 } }, "invalid")).rejects.toThrow(
        "getCredential() options must be an object"
      )
    })

    it("does not overwrite non-undefined primitive values in mergeClientWorkloadDetails", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "token-1",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({
          aws: {
            instanceId: "i-12345",
            nested: { existingKey: "keep-this" }
          }
        })),
        clientWorkloadDetails: {
          aws: {
            instanceId: "override-attempt-should-be-ignored",
            nested: { newKey: "add-this" },
            newTopKey: "added"
          }
        }
      })

      await client.authenticate()
      const authBody = parseRequestBody(fetchMock, 0) as { client: Record<string, unknown> }
      expect(authBody.client).toEqual({
        aws: {
          instanceId: "i-12345",
          nested: {
            existingKey: "keep-this",
            newKey: "add-this"
          },
          newTopKey: "added"
        }
      })
    })

    it("returns cached state in authenticateWithSingleFlight when not forced and valid", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "token-1",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { doc: "doc" } }))
      })

      // Authenticate to populate cache
      await client.authenticate()

      // Call internal authenticateWithSingleFlight with force=false
      const state = await (
        client as unknown as {
          authenticateWithSingleFlight: (
            options: object,
            force: boolean,
            expectedResourceSet?: string,
            expectedRetry?: unknown,
            identity?: unknown
          ) => Promise<{ accessToken: string }>
        }
      ).authenticateWithSingleFlight({}, false, undefined, undefined, {
        client: { aws: { doc: "doc" } },
        authCacheKey: undefined
      })

      expect(state.accessToken).toBe("token-1")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("collects identity in runAuthentication when identity parameter is omitted", async () => {
      const fetchMock = vi.fn((input: unknown) => {
        const path = new URL(String(input)).pathname
        if (path === "/edge/v1/auth") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                accessToken: "token-fallback",
                tokenType: "Bearer",
                expiresIn: 3600
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        }
        return Promise.reject(new Error("unexpected"))
      })
      vi.stubGlobal("fetch", asFetchMock(fetchMock))

      const client = new EdgeClient({
        baseUrl: "https://tenant.aembit.io",
        clientId: "client-id",
        trustProvider: createTrustProvider(async () => ({ aws: { doc: "doc" } }))
      })

      const state = await (
        client as unknown as {
          runAuthentication: (options: object) => Promise<{ accessToken: string }>
        }
      ).runAuthentication({})

      expect(state.accessToken).toBe("token-fallback")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
