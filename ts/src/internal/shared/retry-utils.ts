// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicyOverride } from "../../types/retry.js";

/**
 * Merges request-level retry override fields over base retry override fields.
 * Fields set to `undefined` in the request override do not erase base values.
 */
export function mergeRetryOverrides(
  base?: RetryPolicyOverride,
  request?: RetryPolicyOverride
): RetryPolicyOverride | undefined {
  if (!base && !request) {
    return undefined;
  }

  const baseOverride = base ?? {};
  const requestOverride = request ?? {};

  return {
    enabled: requestOverride.enabled ?? baseOverride.enabled,
    maxAttempts: requestOverride.maxAttempts ?? baseOverride.maxAttempts,
    baseDelayMs: requestOverride.baseDelayMs ?? baseOverride.baseDelayMs,
    maxDelayMs: requestOverride.maxDelayMs ?? baseOverride.maxDelayMs,
    jitter: requestOverride.jitter ?? baseOverride.jitter,
    retryableStatusCodes:
      requestOverride.retryableStatusCodes ?? baseOverride.retryableStatusCodes
  };
}
