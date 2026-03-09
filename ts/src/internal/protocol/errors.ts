import type {
  ApiErrorLike,
  AuthErrorLike,
  CredentialErrorLike,
  EdgeErrorKind,
  EdgeSdkErrorLike,
  TransportErrorLike
} from "../../types/errors.js";
import type { EdgeGenericErrorBody, EdgeResponseHeaders } from "./types.js";
import { isRetryableHttpStatus } from "./retry.js";

type HeaderLookup = {
  get(name: string): string | null;
};

type EdgeOperation = "auth" | "credentials" | "api";

interface EdgeSdkErrorInit {
  kind: EdgeErrorKind;
  statusCode?: number;
  apiCode?: string;
  requestId?: string;
  retryable?: boolean;
  cause?: unknown;
}

interface HttpErrorMappingInput {
  operation: EdgeOperation;
  statusCode: number;
  body?: unknown;
  headers?: EdgeResponseHeaders | HeaderLookup;
  retryableStatusCodes?: number[];
  message?: string;
  cause?: unknown;
}

/**
 * Base SDK error used by protocol/transport implementations.
 */
export class EdgeSdkError extends Error implements EdgeSdkErrorLike {
  readonly kind: EdgeErrorKind;
  readonly statusCode?: number;
  readonly apiCode?: string;
  readonly requestId?: string;
  readonly retryable?: boolean;
  override cause?: unknown;

  constructor(message: string, init: EdgeSdkErrorInit) {
    super(message);
    this.name = new.target.name;
    this.kind = init.kind;
    this.statusCode = init.statusCode;
    this.apiCode = init.apiCode;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.cause = init.cause;
  }
}

export class TransportError extends EdgeSdkError implements TransportErrorLike {
  readonly kind = "transport" as const;

  constructor(message: string, init: Omit<EdgeSdkErrorInit, "kind"> = {}) {
    super(message, { ...init, kind: "transport" });
  }
}

export class ApiError extends EdgeSdkError implements ApiErrorLike {
  readonly kind = "api" as const;

  constructor(message: string, init: Omit<EdgeSdkErrorInit, "kind"> = {}) {
    super(message, { ...init, kind: "api" });
  }
}

export class AuthError extends EdgeSdkError implements AuthErrorLike {
  readonly kind = "auth" as const;

  constructor(message: string, init: Omit<EdgeSdkErrorInit, "kind"> = {}) {
    super(message, { ...init, kind: "auth" });
  }
}

export class CredentialError extends EdgeSdkError implements CredentialErrorLike {
  readonly kind = "credential" as const;

  constructor(message: string, init: Omit<EdgeSdkErrorInit, "kind"> = {}) {
    super(message, { ...init, kind: "credential" });
  }
}

export function isRetryableStatusCode(statusCode: number): boolean {
  return isRetryableHttpStatus(statusCode);
}

export function extractEdgeGenericErrorBody(body: unknown): EdgeGenericErrorBody | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const candidate = body as Record<string, unknown>;

  return {
    success: typeof candidate.success === "boolean" ? candidate.success : undefined,
    message: typeof candidate.message === "string" ? candidate.message : null,
    id: typeof candidate.id === "number" ? candidate.id : undefined
  };
}

export function extractRequestId(headers?: EdgeResponseHeaders | HeaderLookup): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof (headers as HeaderLookup).get === "function") {
    const byXRequestId = (headers as HeaderLookup).get("x-request-id");
    if (byXRequestId) {
      return byXRequestId;
    }
    const byRequestId = (headers as HeaderLookup).get("request-id");
    return byRequestId || undefined;
  }

  const record = headers as EdgeResponseHeaders;
  for (const key of Object.keys(record)) {
    const normalized = key.toLowerCase();
    if (normalized === "x-request-id" || normalized === "request-id") {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }

  return undefined;
}

export function mapHttpError(input: HttpErrorMappingInput): ApiError | AuthError | CredentialError {
  const normalizedBody = extractEdgeGenericErrorBody(input.body);
  const requestId = extractRequestId(input.headers);
  const apiCode = normalizedBody?.id !== undefined ? String(normalizedBody.id) : undefined;
  const message =
    input.message ||
    normalizedBody?.message ||
    `Edge API request failed with status ${input.statusCode}`;

  const common = {
    statusCode: input.statusCode,
    apiCode,
    requestId,
    retryable: isRetryableHttpStatus(input.statusCode, input.retryableStatusCodes ?? []),
    cause: input.cause
  };

  if (input.operation === "auth") {
    return new AuthError(message, common);
  }

  if (input.operation === "credentials") {
    return new CredentialError(message, common);
  }

  return new ApiError(message, common);
}

interface TransportErrorMappingOptions {
  retryable?: boolean;
}

export function mapTransportError(
  error: unknown,
  message = "Edge transport request failed",
  options: TransportErrorMappingOptions = {}
): TransportError {
  if (error instanceof TransportError) {
    return error;
  }

  const causeMessage =
    error instanceof Error && typeof error.message === "string" && error.message.length > 0
      ? `: ${error.message}`
      : "";

  return new TransportError(`${message}${causeMessage}`, {
    retryable: options.retryable ?? true,
    cause: error
  });
}
