import { describe, expect, it, vi } from "vitest";

import { ApiError, AuthError, CredentialError } from "./errors.js";
import { EdgeApi, type EdgeApiOptions } from "./edge-api.js";
import type { EdgeAuthRequestBody, EdgeCredentialsRequestBody } from "./types.js";

function getFirstCallArgument(
  mock: ReturnType<typeof vi.fn>
): Record<string, unknown> {
  const call = mock.mock.calls[0] as [unknown] | undefined;
  if (!call) {
    throw new Error("Expected mock to be called");
  }

  return call[0] as Record<string, unknown>;
}

interface RequestMatcher {
  operation: string;
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function assertRequestMatches(
  actual: Record<string, unknown>,
  expected: RequestMatcher
): void {
  expect(actual.operation).toBe(expected.operation);
  expect(actual.path).toBe(expected.path);
  expect(actual.method).toBe(expected.method);
  expect(actual.body).toEqual(expected.body);
  expect(actual.headers).toEqual(expect.objectContaining(expected.headers));
}

describe("EdgeApi", () => {
  it("builds auth request with operation, path, and resource set header", async () => {
    const requestJsonMock = vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      body: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: 3600
      },
      headers: {}
    }));

    const api = new EdgeApi({
      transport: {
        requestJson:
          requestJsonMock as unknown as EdgeApiOptions["transport"]["requestJson"]
      },
      resourceSet: "rs-default"
    });

    const authBody: EdgeAuthRequestBody = {
      clientId: "client-id",
      client: { aws: { instanceIdentityDocument: "doc" } }
    };

    const result = await api.auth(authBody);
    expect(result.accessToken).toBe("token");

    expect(requestJsonMock).toHaveBeenCalledTimes(1);
    assertRequestMatches(getFirstCallArgument(requestJsonMock), {
      operation: "auth",
      path: "/edge/v1/auth",
      method: "POST",
      body: authBody,
      headers: {
        "X-Aembit-ResourceSet": "rs-default",
        "Content-Type": "application/json"
      }
    });
  });

  it("builds credentials request with bearer token and resource set override", async () => {
    const requestJsonMock = vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      body: {
        credentialType: "ApiKey",
        expiresAt: null,
        data: { apiKey: "k" }
      },
      headers: {}
    }));

    const api = new EdgeApi({
      transport: {
        requestJson:
          requestJsonMock as unknown as EdgeApiOptions["transport"]["requestJson"]
      },
      resourceSet: "rs-default"
    });

    const credentialsBody: EdgeCredentialsRequestBody = {
      client: { aws: { instanceIdentityDocument: "doc" } },
      server: { transportProtocol: "TCP", host: "db.local", port: 443 },
      credentialType: "ApiKey"
    };

    const result = await api.credentials(credentialsBody, "bearer-token", {
      resourceSet: "rs-override"
    });
    expect(result.data?.apiKey).toBe("k");

    expect(requestJsonMock).toHaveBeenCalledTimes(1);
    assertRequestMatches(getFirstCallArgument(requestJsonMock), {
      operation: "credentials",
      path: "/edge/v1/credentials",
      method: "POST",
      body: credentialsBody,
      headers: {
        Authorization: "Bearer bearer-token",
        "X-Aembit-ResourceSet": "rs-override",
        "Content-Type": "application/json"
      }
    });
  });

  it("maps ApiError to AuthError for auth calls", async () => {
    const requestJsonMock = vi.fn(async () => {
      throw new ApiError("auth failed", {
        statusCode: 400,
        apiCode: "100",
        requestId: "req-auth",
        retryable: false
      });
    });

    const api = new EdgeApi({
      transport: {
        requestJson:
          requestJsonMock
      }
    });

    await expect(
      api.auth({
        clientId: "client-id",
        client: {}
      })
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("maps ApiError to CredentialError for credentials calls", async () => {
    const requestJsonMock = vi.fn(async () => {
      throw new ApiError("credentials failed", {
        statusCode: 400,
        apiCode: "101",
        requestId: "req-cred",
        retryable: false
      });
    });

    const api = new EdgeApi({
      transport: {
        requestJson:
          requestJsonMock
      }
    });

    await expect(
      api.credentials(
        {
          client: {},
          server: { transportProtocol: "TCP" }
        },
        "bearer-token"
      )
    ).rejects.toBeInstanceOf(CredentialError);
  });
});
