// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { AuthError } from "../protocol/errors.js";
import type { EdgeAuthSuccessBody } from "../protocol/types.js";
import { isRecord } from "../shared/type-guards.js";

/**
 * Parses and validates access token values from `/edge/v1/auth` responses.
 */
export function parseAccessToken(token: string | null | undefined): string {
  const value = typeof token === "string" ? token.trim() : "";
  if (value.length === 0) {
    throw new AuthError("Edge auth response missing accessToken", {
      retryable: false
    });
  }

  return value;
}

/**
 * Validates auth success payload structure.
 */
export function parseAuthSuccessBody(response: EdgeAuthSuccessBody): EdgeAuthSuccessBody {
  if (!isRecord(response)) {
    throw new AuthError("Edge auth response payload must be an object", {
      retryable: false
    });
  }

  return response;
}

/**
 * Resolves auth token expiry timestamp in milliseconds.
 */
export function calculateExpiresAtMs(
  expiresInSeconds: number | undefined,
  nowMs: number
): number | null {
  if (expiresInSeconds === undefined) {
    return null;
  }

  if (
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds < 0
  ) {
    throw new AuthError("Edge auth response contains invalid expiresIn", {
      retryable: false
    });
  }

  return nowMs + Math.round(expiresInSeconds * 1000);
}
