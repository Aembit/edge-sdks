// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { mergeRetryPolicy } from "../protocol/retry.js";
import { mergeRetryOverrides } from "../shared/retry-utils.js";
import type { RetryPolicyOverride } from "../../types/retry.js";

const DEFAULT_AUTH_EXPIRY_SKEW_MS = 60_000;

export interface CachedTokenState {
  accessToken: string;
  expiresAtMs: number | null;
  resourceSet?: string;
  authCacheKey?: string;
}

interface AuthSingleFlightKey {
  resourceSet?: string;
  authCacheKey?: string;
  retryKey: string;
}

/**
 * Resolves configured token expiry skew in milliseconds.
 */
export function resolveAuthExpirySkewMs(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return DEFAULT_AUTH_EXPIRY_SKEW_MS;
}

/**
 * Returns true when cached token state is still valid for use.
 */
export function isTokenValid(
  tokenState: CachedTokenState | undefined,
  nowMs: number,
  skewMs: number
): tokenState is CachedTokenState {
  if (!tokenState) {
    return false;
  }

  if (tokenState.expiresAtMs === null) {
    return true;
  }

  return nowMs < tokenState.expiresAtMs - skewMs;
}

/**
 * Formats optional expiry timestamp as ISO string for public session output.
 */
export function formatExpiresAt(expiresAtMs: number | null): string | null {
  if (expiresAtMs === null) {
    return null;
  }

  return new Date(expiresAtMs).toISOString();
}

/**
 * Resolves request-level Resource Set override against client default.
 */
export function resolveEffectiveResourceSet(
  defaultResourceSet: string | undefined,
  requestResourceSet: string | undefined
): string | undefined {
  return requestResourceSet ?? defaultResourceSet;
}

/**
 * Serializes single-flight key for in-flight auth de-duplication.
 */
export function serializeAuthSingleFlightKey(key: AuthSingleFlightKey): string {
  return JSON.stringify([key.resourceSet ?? null, key.authCacheKey ?? null, key.retryKey]);
}

/**
 * Serializes the effective retry policy into a stable cache key.
 */
export function serializeEffectiveRetryPolicyKey(
  baseRetry: RetryPolicyOverride | undefined,
  requestRetry: RetryPolicyOverride | undefined
): string {
  const mergedOverride = mergeRetryOverrides(baseRetry, requestRetry);
  const effectiveRetry = mergeRetryPolicy(mergedOverride);

  return JSON.stringify({
    enabled: effectiveRetry.enabled,
    maxAttempts: effectiveRetry.maxAttempts,
    baseDelayMs: effectiveRetry.baseDelayMs,
    maxDelayMs: effectiveRetry.maxDelayMs,
    jitter: effectiveRetry.jitter,
    retryableStatusCodes: normalizeRetryableStatusCodes(
      effectiveRetry.retryableStatusCodes
    )
  });
}

function normalizeRetryableStatusCodes(
  statusCodes: number[] | undefined
): number[] | undefined {
  if (!statusCodes || statusCodes.length === 0) {
    return undefined;
  }

  return [...new Set(statusCodes)].sort((left, right) => left - right);
}
