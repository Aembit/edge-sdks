// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
export {
  calculateExpiresAtMs,
  parseAccessToken,
  parseAuthSuccessBody
} from "./auth-parsing.js";

export {
  normalizeServerRef,
  parseCredentialSuccessBody
} from "./credential-parsing.js";

export {
  formatExpiresAt,
  isTokenValid,
  resolveAuthExpirySkewMs,
  resolveEffectiveResourceSet,
  serializeAuthSingleFlightKey,
  serializeEffectiveRetryPolicyKey
} from "./token-state.js";

export { SafeLogger } from "./logger.js";

export type { CachedTokenState } from "./token-state.js";
