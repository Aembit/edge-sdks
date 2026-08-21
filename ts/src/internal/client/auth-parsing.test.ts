// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import { AuthError } from "../protocol/errors.js";
import {
  calculateExpiresAtMs,
  parseAccessToken,
  parseAuthSuccessBody
} from "./auth-parsing.js";

describe("auth-parsing", () => {
  it("parses non-empty accessToken values", () => {
    expect(parseAccessToken(" token-1 ")).toBe("token-1");
  });

  it("rejects missing accessToken values", () => {
    expect(() => parseAccessToken(undefined)).toThrow(AuthError);
    expect(() => parseAccessToken("   ")).toThrow("Edge auth response missing accessToken");
  });

  it("requires auth success payload to be an object", () => {
    expect(() => parseAuthSuccessBody(null as never)).toThrow(AuthError);
    expect(() => parseAuthSuccessBody("bad" as never)).toThrow(
      "Edge auth response payload must be an object"
    );
  });

  it("returns null expiry when expiresIn is absent", () => {
    expect(calculateExpiresAtMs(undefined, 1000)).toBeNull();
  });

  it("calculates expiry timestamp from valid expiresIn seconds", () => {
    expect(calculateExpiresAtMs(2.5, 1000)).toBe(3500);
  });

  it("rejects malformed expiresIn values", () => {
    expect(() => calculateExpiresAtMs(-1, 0)).toThrow(AuthError);
    expect(() => calculateExpiresAtMs(Number.NaN, 0)).toThrow(
      "Edge auth response contains invalid expiresIn"
    );
  });
});
