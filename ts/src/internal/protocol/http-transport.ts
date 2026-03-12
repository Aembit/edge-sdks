import type { RetryPolicyOverride } from "../../types/retry.js";
import { EdgeSdkError, TransportError, mapHttpError, mapTransportError } from "./errors.js";
import { executeWithRetry, isRetryableHttpStatus, mergeRetryPolicy } from "./retry.js";
import { isAbortError, resolveRequestUrl } from "../shared/http-utils.js";
import { mergeRetryOverrides } from "../shared/retry-utils.js";
import type { EdgeResponseHeaders, EdgeSuccessResponse } from "./types.js";

type EdgeProtocolOperation = "auth" | "credentials" | "api";

/**
 * Supported HTTP methods for Aembit Edge API requests.
 */
export type EdgeTransportMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Construction options for the protocol HTTP transport.
 */
export interface EdgeTransportOptions {
  /**
   * Base URL for the tenant Aembit Edge API.
   */
  baseUrl: string;

  /**
   * Default request timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Default retry policy override for all requests.
   */
  retry?: RetryPolicyOverride;

  /**
   * Optional fetch implementation injection for testing/runtime customization.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Per-request transport settings and request payload.
 */
export interface EdgeTransportRequest<TBody = unknown> {
  operation: EdgeProtocolOperation;
  path: string;
  method?: EdgeTransportMethod;
  headers?: Record<string, string | undefined>;
  body?: TBody;
  timeoutMs?: number;
  retry?: RetryPolicyOverride;
}

/**
 * HTTP transport used by the protocol layer.
 */
export class EdgeHttpTransport {
  private readonly baseUrl: string;
  private readonly timeoutMs?: number;
  private readonly retry?: RetryPolicyOverride;
  private readonly fetchImpl: typeof fetch;

  constructor(options: EdgeTransportOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.retry = options.retry;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Executes an HTTP request, parses JSON response payloads, and applies retry/error mapping.
   */
  async requestJson<TSuccessBody, TSuccessStatus extends number = number>(
    request: EdgeTransportRequest
  ): Promise<EdgeSuccessResponse<TSuccessStatus, TSuccessBody>> {
    const effectiveRetryOverride = mergeRetryOverrides(this.retry, request.retry);
    const effectiveRetryPolicy = mergeRetryPolicy(effectiveRetryOverride);

    return executeWithRetry(
      async () =>
        this.requestJsonOnce<TSuccessBody, TSuccessStatus>(
          request,
          effectiveRetryPolicy.retryableStatusCodes
        ),
      {
        policy: effectiveRetryOverride,
        isRetryableError: (error) => {
          if (!(error instanceof EdgeSdkError)) {
            return false;
          }

          if (typeof error.statusCode === "number") {
            return isRetryableHttpStatus(
              error.statusCode,
              effectiveRetryPolicy.retryableStatusCodes ?? []
            );
          }

          return error.retryable === true;
        }
      }
    );
  }

  private async requestJsonOnce<TSuccessBody, TSuccessStatus extends number = number>(
    request: EdgeTransportRequest,
    retryableStatusCodes?: number[]
  ): Promise<EdgeSuccessResponse<TSuccessStatus, TSuccessBody>> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let url = "";
    let init: RequestInit = {};

    try {
      url = resolveRequestUrl(this.baseUrl, request.path);
      const method = request.method ?? "POST";
      const timeoutMs = request.timeoutMs ?? this.timeoutMs;

      if (method === "GET" && request.body !== undefined) {
        throw new Error(`HTTP ${method} requests cannot include a body`);
      }

      const controller = new AbortController();
      timeoutId =
        typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;

      const headers = normalizeRequestHeaders(request.headers);
      if (request.body !== undefined && !hasHeader(headers, "content-type")) {
        headers["content-type"] = "application/json";
      }

      init = {
        method,
        headers,
        signal: controller.signal
      };

      if (request.body !== undefined) {
        init.body = JSON.stringify(request.body);
      }
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw mapTransportError(error, "Edge transport request failed", {
        retryable: false
      });
    }

    try {
      const response = await this.fetchImpl(url, init);
      const responseHeaders = normalizeResponseHeaders(response.headers);
      const parsedBody = await parseJsonBody(response);

      if (response.ok) {
        if (parsedBody.kind === "invalid" || parsedBody.kind === "empty") {
          const message =
            parsedBody.kind === "empty"
              ? "Edge response body is empty for JSON request"
              : "Edge response body is not valid JSON";

          throw new TransportError(message, {
            retryable: false,
            cause: parsedBody.kind === "invalid" ? parsedBody.error : undefined
          });
        }

        return {
          ok: true,
          status: response.status as TSuccessStatus,
          body: parsedBody.value as TSuccessBody,
          headers: responseHeaders
        };
      }

      throw mapHttpError({
        operation: request.operation,
        statusCode: response.status,
        body: parsedBody.kind === "valid" ? parsedBody.value : undefined,
        headers: responseHeaders,
        retryableStatusCodes
      });
    } catch (error) {
      if (error instanceof EdgeSdkError) {
        throw error;
      }

      const timeoutMs = request.timeoutMs ?? this.timeoutMs;
      const timeoutMessage =
        typeof timeoutMs === "number" && timeoutMs > 0 && isAbortError(error)
          ? `Edge request timed out after ${timeoutMs}ms`
          : "Edge transport request failed";
      throw mapTransportError(error, timeoutMessage, {
        retryable: true
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

function normalizeRequestHeaders(
  headers?: Record<string, string | undefined>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) {
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const needle = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === needle);
}

function normalizeResponseHeaders(headers: Headers): EdgeResponseHeaders {
  const normalized: EdgeResponseHeaders = {};
  headers.forEach((value, key) => {
    normalized[key] = value;
  });
  return normalized;
}

type ParsedJsonBody =
  | { kind: "empty"; value: undefined }
  | { kind: "valid"; value: unknown }
  | { kind: "invalid"; error: unknown };

async function parseJsonBody(response: Response): Promise<ParsedJsonBody> {
  const raw = await response.text();
  if (!raw) {
    return { kind: "empty", value: undefined };
  }

  try {
    return { kind: "valid", value: JSON.parse(raw) as unknown };
  } catch (error) {
    return { kind: "invalid", error };
  }
}
