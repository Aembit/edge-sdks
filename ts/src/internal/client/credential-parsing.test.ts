// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import { CredentialError } from "../protocol/errors.js";
import {
  normalizeServerRef,
  parseCredentialSuccessBody
} from "./credential-parsing.js";

describe("credential-parsing", () => {
  it("normalizes valid server input and defaults transport protocol to TCP", () => {
    expect(
      normalizeServerRef({
        host: " db.internal ",
        port: 443
      })
    ).toEqual({
      host: "db.internal",
      port: 443,
      transportProtocol: "TCP"
    });
  });

  it("rejects invalid server input", () => {
    expect(() => normalizeServerRef(null as never)).toThrow(CredentialError);
    expect(() =>
      normalizeServerRef({
        host: "",
        port: 443
      })
    ).toThrow("getCredential() requires server.host");
    expect(() =>
      normalizeServerRef({
        host: "db.internal",
        port: 0
      })
    ).toThrow("getCredential() requires a valid server.port");
    expect(() =>
      normalizeServerRef({
        host: "db.internal",
        port: 443,
        transportProtocol: "UDP" as never
      })
    ).toThrow("Unsupported server.transportProtocol. Only 'TCP' is supported");
  });

  it("requires credential success payload to be an object", () => {
    expect(() => parseCredentialSuccessBody(null as never)).toThrow(CredentialError);
    expect(() => parseCredentialSuccessBody("bad" as never)).toThrow(
      "Edge credential response payload must be an object"
    );
  });

  it("rejects malformed credential success fields", () => {
    expect(() =>
      parseCredentialSuccessBody({
        credentialType: 123 as never
      })
    ).toThrow("Edge credential response field 'credentialType' must be a string when provided");
    expect(() =>
      parseCredentialSuccessBody({
        expiresAt: 123 as never
      })
    ).toThrow(
      "Edge credential response field 'expiresAt' must be a string or null when provided"
    );
    expect(() =>
      parseCredentialSuccessBody({
        data: "bad" as never
      })
    ).toThrow("Edge credential response field 'data' must be an object when provided");
  });

  it("returns validated credential payload", () => {
    expect(
      parseCredentialSuccessBody({
        credentialType: "ApiKey",
        expiresAt: null,
        data: {
          apiKey: "abc"
        }
      })
    ).toEqual({
      credentialType: "ApiKey",
      expiresAt: null,
      data: {
        apiKey: "abc"
      }
    });
  });
});
