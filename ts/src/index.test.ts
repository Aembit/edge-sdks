// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import {
  EdgeClient,
  createAwsMetadataServiceTrustProvider,
  createAwsRoleTrustProvider,
  createAzureMetadataServiceTrustProvider,
  createGcpIdentityTokenTrustProvider,
  createGitHubIdentityTokenTrustProvider,
  createOidcIdTokenTrustProvider,
  trustProviders,
  type AembitLogger,
  type AuthSession,
  type LogContext
} from "./index.js";

describe("public type exports", () => {
  it("supports AuthSession typing", () => {
    const session: AuthSession = {
      authenticated: true,
      expiresAt: null,
      trustProviderId: "test-provider"
    };

    expect(session.authenticated).toBe(true);
    expect(session.trustProviderId).toBe("test-provider");
  });

  it("supports AembitLogger typing", () => {
    const context: LogContext = { key: "value" };
    const logger: AembitLogger = {
      debug: (_msg, _ctx) => {},
      info: (_msg, _ctx) => {},
      warn: (_msg, _ctx) => {},
      error: (_msg, _ctx) => {}
    };

    expect(typeof logger.debug).toBe("function");
    expect(context.key).toBe("value");
  });

  it("exports EdgeClient runtime class", () => {
    expect(typeof EdgeClient).toBe("function");
  });

  it("exports built-in trust provider factories", () => {
    expect(typeof trustProviders.awsMetadataService).toBe("function");
    expect(typeof trustProviders.awsRole).toBe("function");
    expect(typeof trustProviders.azureMetadataService).toBe("function");
    expect(typeof trustProviders.gcpIdentityToken).toBe("function");
    expect(typeof trustProviders.githubIdentityToken).toBe("function");
    expect(typeof trustProviders.oidcIdToken).toBe("function");
    expect(typeof createAwsMetadataServiceTrustProvider).toBe("function");
    expect(typeof createAwsRoleTrustProvider).toBe("function");
    expect(typeof createAzureMetadataServiceTrustProvider).toBe("function");
    expect(typeof createGcpIdentityTokenTrustProvider).toBe("function");
    expect(typeof createGitHubIdentityTokenTrustProvider).toBe("function");
    expect(typeof createOidcIdTokenTrustProvider).toBe("function");
  });

  it("exports SDK error classes", async () => {
    const {
      ApiError,
      AuthError,
      CredentialError,
      EdgeSdkError,
      TransportError,
      TrustProviderError
    } = await import("./index.js");

    expect(typeof ApiError).toBe("function");
    expect(typeof AuthError).toBe("function");
    expect(typeof CredentialError).toBe("function");
    expect(typeof EdgeSdkError).toBe("function");
    expect(typeof TransportError).toBe("function");
    expect(typeof TrustProviderError).toBe("function");
  });
});
