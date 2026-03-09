import { describe, expect, it } from "vitest";

import { EdgeClient } from "./index.js";
import type { AuthSession } from "./index.js";

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
});
