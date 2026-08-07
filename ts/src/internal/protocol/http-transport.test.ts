import { describe, expect, it, vi } from "vitest";

import { AuthError, TransportError } from "./errors.js";
import { EdgeHttpTransport } from "./http-transport.js";

function asFetchMock(
  fn: (input: unknown, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return fn;
}

describe("EdgeHttpTransport", () => {
  it("sends JSON request body with default content-type", async () => {
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-1"
          }
        })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    const result = await transport.requestJson<{ ok: boolean }, 200>({
      operation: "api",
      path: "/edge/v1/auth",
      body: { hello: "world" }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://tenant.aembit.io/edge/v1/auth");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(JSON.stringify({ hello: "world" }));

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.headers["x-request-id"]).toBe("req-1");
  });

  it("maps auth HTTP failures and retries retryable statuses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "server failure", id: 42 }), {
        status: 500,
        headers: { "x-request-id": "req-500" }
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "auth",
        path: "/edge/v1/auth",
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
      })
    ).rejects.toMatchObject({
      kind: "auth",
      statusCode: 500,
      apiCode: "42",
      requestId: "req-500",
      retryable: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("merges request retry overrides with transport retry defaults", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "server failure", id: 99 }), {
        status: 500
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock),
      retry: {
        enabled: false,
        maxAttempts: 4,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    });

    await expect(
      transport.requestJson({
        operation: "auth",
        path: "/edge/v1/auth",
        retry: { enabled: true }
      })
    ).rejects.toBeInstanceOf(AuthError);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("preserves transport retry defaults when request override fields are undefined", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "server failure", id: 77 }), {
        status: 500
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock),
      retry: {
        enabled: true,
        maxAttempts: 5,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: false
      }
    });

    await expect(
      transport.requestJson({
        operation: "auth",
        path: "/edge/v1/auth",
        retry: { maxAttempts: undefined }
      })
    ).rejects.toBeInstanceOf(AuthError);

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("retries custom retryable HTTP status codes from policy", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "conflict", id: 409 }), {
        status: 409
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/credentials",
        retry: {
          maxAttempts: 3,
          baseDelayMs: 0,
          maxDelayMs: 0,
          jitter: false,
          retryableStatusCodes: [409]
        }
      })
    ).rejects.toMatchObject({
      kind: "api",
      statusCode: 409,
      retryable: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable HTTP failures", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "bad request", id: 1 }), {
        status: 400
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "auth",
        path: "/edge/v1/auth",
        retry: { maxAttempts: 5, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
      })
    ).rejects.toBeInstanceOf(AuthError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transport failures and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down again"))
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    const result = await transport.requestJson<{ ok: boolean }>({
      operation: "api",
      path: "/edge/v1/credentials",
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
    });

    expect(result.body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries fetch TypeError network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network failure"))
      .mockRejectedValueOnce(new TypeError("network failure"))
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock),
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
    });

    const result = await transport.requestJson<{ ok: boolean }>({
      operation: "api",
      path: "/edge/v1/auth"
    });

    expect(result.body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps abort timeout failures to transport errors", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      async (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            (error as { name?: string }).name = "AbortError";
            reject(error);
          });
        })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      timeoutMs: 10,
      fetchImpl: asFetchMock(fetchMock)
    });

    const pending = transport.requestJson({
      operation: "api",
      path: "/edge/v1/auth",
      retry: { enabled: false }
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(TransportError);

    try {
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps URL resolution failures to transport errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "not a url",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/auth",
        retry: { enabled: false }
      })
    ).rejects.toMatchObject({
      kind: "transport",
      retryable: false
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast on malformed JSON in 2xx responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/auth",
        retry: { enabled: false }
      })
    ).rejects.toMatchObject({
      kind: "transport",
      retryable: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast on empty JSON body in 2xx responses", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock)
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/auth",
        retry: { enabled: false }
      })
    ).rejects.toMatchObject({
      kind: "transport",
      retryable: false
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry deterministic local serialization failures", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const circular: { self?: unknown } = {};
    circular.self = circular;

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock),
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/auth",
        body: circular
      })
    ).rejects.toMatchObject({
      kind: "transport",
      retryable: false
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails fast for GET requests with a body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const transport = new EdgeHttpTransport({
      baseUrl: "https://tenant.aembit.io",
      fetchImpl: asFetchMock(fetchMock),
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: false }
    });

    await expect(
      transport.requestJson({
        operation: "api",
        path: "/edge/v1/auth",
        method: "GET",
        body: { invalid: true }
      })
    ).rejects.toMatchObject({
      kind: "transport",
      retryable: false
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
