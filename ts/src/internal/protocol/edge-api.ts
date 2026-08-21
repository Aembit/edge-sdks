// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js";
import {
  ApiError,
  AuthError,
  CredentialError,
  EdgeSdkError
} from "./errors.js";
import type { EdgeTransportRequest } from "./http-transport.js";
import type {
  EdgeAuthRequestBody,
  EdgeAuthSuccessBody,
  EdgeCredentialsRequestBody,
  EdgeCredentialsSuccessBody,
  EdgeSuccessResponse
} from "./types.js";

/**
 * Per-call options for Aembit Edge API operations.
 */
export interface EdgeApiRequestOptions {
  /**
   * Optional resource set override for this call.
   */
  resourceSet?: string;
  /**
   * Optional per-call timeout in milliseconds.
   */
  timeoutMs?: number;
  /**
   * Optional per-call retry policy override.
   */
  retry?: RetryPolicyOverride;
}

/**
 * Required configuration for the Aembit Edge API adapter.
 */
export interface EdgeApiOptions {
  /**
   * Shared HTTP transport used for API operations.
   */
  transport: EdgeTransportLike;
  /**
   * Optional default resource set for all calls.
   */
  resourceSet?: string;
}

interface EdgeTransportLike {
  requestJson<TSuccessBody, TSuccessStatus extends number = number>(
    request: EdgeTransportRequest
  ): Promise<EdgeSuccessResponse<TSuccessStatus, TSuccessBody>>;
}

/**
 * Low-level Aembit Edge API adapter for endpoint-specific request construction.
 */
export class EdgeApi {
  private readonly transport: EdgeTransportLike;
  private readonly resourceSet?: string;

  constructor(options: EdgeApiOptions) {
    this.transport = options.transport;
    this.resourceSet = options.resourceSet;
  }

  /**
   * Calls `POST /edge/v1/auth`.
   */
  async auth(
    body: EdgeAuthRequestBody,
    options: EdgeApiRequestOptions = {}
  ): Promise<EdgeAuthSuccessBody> {
    const request: EdgeTransportRequest<EdgeAuthRequestBody> = {
      operation: "auth",
      path: "/edge/v1/auth",
      method: "POST",
      headers: buildHeaders(undefined, options.resourceSet ?? this.resourceSet),
      body,
      timeoutMs: options.timeoutMs,
      retry: options.retry
    };

    try {
      const response = await this.transport.requestJson<EdgeAuthSuccessBody, 200>(request);
      return response.body;
    } catch (error) {
      throw mapEndpointError("auth", error);
    }
  }

  /**
   * Calls `POST /edge/v1/credentials`.
   */
  async credentials(
    body: EdgeCredentialsRequestBody,
    bearerToken: string,
    options: EdgeApiRequestOptions = {}
  ): Promise<EdgeCredentialsSuccessBody> {
    const request: EdgeTransportRequest<EdgeCredentialsRequestBody> = {
      operation: "credentials",
      path: "/edge/v1/credentials",
      method: "POST",
      headers: buildHeaders(bearerToken, options.resourceSet ?? this.resourceSet),
      body,
      timeoutMs: options.timeoutMs,
      retry: options.retry
    };

    try {
      const response = await this.transport.requestJson<EdgeCredentialsSuccessBody, 200>(
        request
      );
      return response.body;
    } catch (error) {
      throw mapEndpointError("credentials", error);
    }
  }
}

function buildHeaders(
  bearerToken?: string,
  resourceSet?: string
): Record<string, string | undefined> {
  return {
    Authorization: bearerToken ? `Bearer ${bearerToken}` : undefined,
    "X-Aembit-ResourceSet": resourceSet,
    "Content-Type": "application/json"
  };
}

function mapEndpointError(
  operation: "auth" | "credentials",
  error: unknown
): unknown {
  if (!(error instanceof EdgeSdkError)) {
    return error;
  }

  if (operation === "auth" && error instanceof AuthError) {
    return error;
  }

  if (operation === "credentials" && error instanceof CredentialError) {
    return error;
  }

  if (error instanceof ApiError) {
    if (operation === "auth") {
      return new AuthError(error.message, edgeErrorInitFrom(error));
    }
    return new CredentialError(error.message, edgeErrorInitFrom(error));
  }

  return error;
}

function edgeErrorInitFrom(error: EdgeSdkError): {
  statusCode?: number;
  apiCode?: string;
  requestId?: string;
  retryable?: boolean;
  cause?: unknown;
} {
  return {
    statusCode: error.statusCode,
    apiCode: error.apiCode,
    requestId: error.requestId,
    retryable: error.retryable,
    cause: error.cause
  };
}
