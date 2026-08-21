// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { RetryPolicy, RetryPolicyOverride } from "../../types/retry.js";

/**
 * Default retry behavior for protocol and transport operations.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  enabled: true,
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true
};

interface ExecuteWithRetryOptions {
  policy?: RetryPolicyOverride;
  isRetryableError?: (error: unknown) => boolean;
  onRetry?: (event: RetryEvent) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Retry callback event emitted before scheduling the next attempt.
 */
export interface RetryEvent {
  /**
   * Current failed attempt number (1-based).
   */
  attempt: number;

  /**
   * Next attempt number that will be executed.
   */
  nextAttempt: number;

  /**
   * Backoff delay in milliseconds before the next attempt.
   */
  delayMs: number;

  /**
   * Error produced by the current failed attempt.
   */
  error: unknown;
}

/**
 * Merges retry overrides with defaults and normalizes invalid numeric values.
 */
export function mergeRetryPolicy(override?: RetryPolicyOverride): RetryPolicy {
  if (!override) {
    return { ...DEFAULT_RETRY_POLICY };
  }

  const maxAttemptsRaw = override.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts;
  const baseDelayMsRaw = override.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs;
  const maxDelayMsRaw = override.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;

  const maxAttempts =
    Number.isFinite(maxAttemptsRaw) ? Math.max(1, Math.floor(maxAttemptsRaw)) : 1;
  const baseDelayMs =
    Number.isFinite(baseDelayMsRaw) ? Math.max(0, Math.floor(baseDelayMsRaw)) : 0;
  const maxDelayMsCandidate =
    Number.isFinite(maxDelayMsRaw) ? Math.max(0, Math.floor(maxDelayMsRaw)) : baseDelayMs;
  const maxDelayMs = Math.max(baseDelayMs, maxDelayMsCandidate);

  return {
    enabled: override.enabled ?? DEFAULT_RETRY_POLICY.enabled,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitter: override.jitter ?? DEFAULT_RETRY_POLICY.jitter,
    retryableStatusCodes: override.retryableStatusCodes ?? DEFAULT_RETRY_POLICY.retryableStatusCodes
  };
}

/**
 * Determines whether an HTTP status code should be retried.
 */
export function isRetryableHttpStatus(
  statusCode: number,
  retryableStatusCodes: number[] = []
): boolean {
  if (statusCode === 429 || statusCode >= 500) {
    return true;
  }

  return retryableStatusCodes.includes(statusCode);
}

/**
 * Calculates bounded exponential backoff delay for a retry attempt.
 * `retryAttempt` is 1-based.
 */
export function calculateBackoffDelayMs(
  retryAttempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random
): number {
  const exponentialDelay = policy.baseDelayMs * Math.pow(2, Math.max(0, retryAttempt - 1));
  const cappedDelay = Math.min(policy.maxDelayMs, exponentialDelay);

  if (!policy.jitter) {
    return cappedDelay;
  }

  return Math.floor(random() * cappedDelay);
}

/**
 * Async sleep helper used by the retry executor.
 */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Executes an async operation with retry behavior.
 * The first call uses `attempt = 1`.
 */
export async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: ExecuteWithRetryOptions = {}
): Promise<T> {
  const policy = mergeRetryPolicy(options.policy);
  const isRetryableError = options.isRetryableError ?? (() => true);
  const onRetry = options.onRetry;
  const sleep = options.sleep ?? sleepMs;
  const random = options.random ?? Math.random;

  const maxAttempts = Math.max(1, policy.maxAttempts);
  const retriesEnabled = policy.enabled && maxAttempts > 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      const shouldRetry =
        retriesEnabled && attempt < maxAttempts && isRetryableError(error);

      if (!shouldRetry) {
        throw error;
      }

      const retryAttempt = attempt;
      const delayMs = calculateBackoffDelayMs(retryAttempt, policy, random);

      if (onRetry) {
        await onRetry({
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error
        });
      }

      await sleep(delayMs);
    }
  }

  throw new Error("Retry execution reached an unreachable state");
}
