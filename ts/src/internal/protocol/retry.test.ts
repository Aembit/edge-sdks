// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";

import {
  calculateBackoffDelayMs,
  executeWithRetry,
  isRetryableHttpStatus,
  mergeRetryPolicy
} from "./retry.js";

describe("mergeRetryPolicy", () => {
  it("uses defaults when override is not provided", () => {
    const policy = mergeRetryPolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.maxAttempts).toBe(3);
    expect(policy.baseDelayMs).toBe(200);
    expect(policy.maxDelayMs).toBe(2000);
    expect(policy.jitter).toBe(true);
  });

  it("applies provided overrides", () => {
    const policy = mergeRetryPolicy({ maxAttempts: 5, jitter: false });
    expect(policy.maxAttempts).toBe(5);
    expect(policy.jitter).toBe(false);
    expect(policy.baseDelayMs).toBe(200);
  });

  it("preserves defaults when override fields are undefined", () => {
    const policy = mergeRetryPolicy({
      maxAttempts: undefined,
      baseDelayMs: undefined,
      maxDelayMs: undefined,
      jitter: undefined
    });

    expect(policy.maxAttempts).toBe(3);
    expect(policy.baseDelayMs).toBe(200);
    expect(policy.maxDelayMs).toBe(2000);
    expect(policy.jitter).toBe(true);
  });

  it("normalizes invalid numeric overrides", () => {
    const policy = mergeRetryPolicy({
      maxAttempts: -5,
      baseDelayMs: -100,
      maxDelayMs: -200
    });

    expect(policy.maxAttempts).toBe(1);
    expect(policy.baseDelayMs).toBe(0);
    expect(policy.maxDelayMs).toBe(0);
  });
});

describe("isRetryableHttpStatus", () => {
  it("marks 429 and 5xx as retryable", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
  });

  it("supports additional retryable codes from policy", () => {
    expect(isRetryableHttpStatus(418)).toBe(false);
    expect(isRetryableHttpStatus(418, [418])).toBe(true);
  });
});

describe("calculateBackoffDelayMs", () => {
  it("calculates exponential delay without jitter", () => {
    const policy = mergeRetryPolicy({
      jitter: false,
      baseDelayMs: 100,
      maxDelayMs: 250
    });

    expect(calculateBackoffDelayMs(1, policy)).toBe(100);
    expect(calculateBackoffDelayMs(2, policy)).toBe(200);
    expect(calculateBackoffDelayMs(3, policy)).toBe(250);
  });

  it("applies jitter using the provided random function", () => {
    const policy = mergeRetryPolicy({
      jitter: true,
      baseDelayMs: 100,
      maxDelayMs: 400
    });

    expect(calculateBackoffDelayMs(2, policy, () => 0.5)).toBe(100);
  });
});

describe("executeWithRetry", () => {
  it("retries until success", async () => {
    const fn = vi.fn(async (attempt: number) => {
      if (attempt < 3) {
        throw new Error("temporary");
      }
      return "ok";
    });
    const sleep = vi.fn(async () => {});

    const result = await executeWithRetry(fn, {
      policy: { maxAttempts: 3, jitter: false, baseDelayMs: 1, maxDelayMs: 1 },
      isRetryableError: () => true,
      sleep
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("bad request");
    });
    const sleep = vi.fn(async () => {});

    await expect(
      executeWithRetry(fn, {
        policy: { maxAttempts: 3 },
        isRetryableError: () => false,
        sleep
      })
    ).rejects.toThrow("bad request");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry when retry is disabled", async () => {
    const fn = vi.fn(async () => {
      throw new Error("temporary");
    });
    const sleep = vi.fn(async () => {});

    await expect(
      executeWithRetry(fn, {
        policy: { enabled: false, maxAttempts: 3 },
        isRetryableError: () => true,
        sleep
      })
    ).rejects.toThrow("temporary");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("still executes first attempt when overrides contain undefined fields", async () => {
    const fn = vi.fn(async () => "ok");

    const result = await executeWithRetry(fn, {
      policy: { maxAttempts: undefined }
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
