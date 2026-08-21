// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  formatExpiresAt,
  isTokenValid,
  resolveAuthExpirySkewMs,
  resolveEffectiveResourceSet,
  serializeAuthSingleFlightKey,
  serializeEffectiveRetryPolicyKey
} from "./token-state.js";

describe("token-state", () => {
  it("uses default auth expiry skew when value is missing or invalid", () => {
    expect(resolveAuthExpirySkewMs(undefined)).toBe(60_000);
    expect(resolveAuthExpirySkewMs(Number.NaN)).toBe(60_000);
    expect(resolveAuthExpirySkewMs(-1)).toBe(60_000);
  });

  it("normalizes configured auth expiry skew values", () => {
    expect(resolveAuthExpirySkewMs(1234.9)).toBe(1234);
  });

  it("treats null-expiry tokens as valid", () => {
    expect(
      isTokenValid(
        {
          accessToken: "token-1",
          expiresAtMs: null
        },
        Date.now(),
        60_000
      )
    ).toBe(true);
  });

  it("applies expiry skew when evaluating token validity", () => {
    expect(
      isTokenValid(
        {
          accessToken: "token-2",
          expiresAtMs: 10_000
        },
        9_500,
        600
      )
    ).toBe(false);

    expect(
      isTokenValid(
        {
          accessToken: "token-3",
          expiresAtMs: 10_000
        },
        9_000,
        500
      )
    ).toBe(true);
  });

  it("formats optional expiry as ISO string", () => {
    expect(formatExpiresAt(null)).toBeNull();
    expect(formatExpiresAt(0)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("resolves effective resource set with request override precedence", () => {
    expect(resolveEffectiveResourceSet("default-rs", undefined)).toBe("default-rs");
    expect(resolveEffectiveResourceSet("default-rs", "request-rs")).toBe("request-rs");
  });

  it("serializes auth single-flight key deterministically", () => {
    expect(
      serializeAuthSingleFlightKey({
        resourceSet: "rs-1",
        retryKey: "retry-1"
      })
    ).toBe(JSON.stringify(["rs-1", null, "retry-1"]));

    expect(
      serializeAuthSingleFlightKey({
        resourceSet: "rs-1",
        authCacheKey: "oidc:cache-a",
        retryKey: "retry-1"
      })
    ).toBe(JSON.stringify(["rs-1", "oidc:cache-a", "retry-1"]));
  });

  it("normalizes retryable status codes for effective retry key", () => {
    const keyA = serializeEffectiveRetryPolicyKey(
      undefined,
      {
        retryableStatusCodes: [503, 409, 503]
      }
    );

    const keyB = serializeEffectiveRetryPolicyKey(
      undefined,
      {
        retryableStatusCodes: [409, 503]
      }
    );

    expect(keyA).toBe(keyB);
  });

  it("produces equivalent retry key for semantically equivalent overrides", () => {
    const keyA = serializeEffectiveRetryPolicyKey(undefined, undefined);
    const keyB = serializeEffectiveRetryPolicyKey(undefined, {});

    expect(keyA).toBe(keyB);
  });
});
