import { describe, expect, it } from "vitest";

import {
  EdgeClient,
  createAwsMetadataServiceTrustProvider,
  createAwsRoleTrustProvider,
  createAzureMetadataServiceTrustProvider,
  createGcpIdentityTokenTrustProvider,
  createOidcIdTokenTrustProvider,
  trustProviders,
  type AuthSession
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

  it("exports EdgeClient runtime class", () => {
    expect(typeof EdgeClient).toBe("function");
  });

  it("exports built-in trust provider factories", () => {
    expect(typeof trustProviders.awsMetadataService).toBe("function");
    expect(typeof trustProviders.awsRole).toBe("function");
    expect(typeof trustProviders.azureMetadataService).toBe("function");
    expect(typeof trustProviders.gcpIdentityToken).toBe("function");
    expect(typeof trustProviders.oidcIdToken).toBe("function");
    expect(typeof createAwsMetadataServiceTrustProvider).toBe("function");
    expect(typeof createAwsRoleTrustProvider).toBe("function");
    expect(typeof createAzureMetadataServiceTrustProvider).toBe("function");
    expect(typeof createGcpIdentityTokenTrustProvider).toBe("function");
    expect(typeof createOidcIdTokenTrustProvider).toBe("function");
  });
});
