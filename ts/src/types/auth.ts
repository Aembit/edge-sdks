// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
/**
 * Authentication result metadata returned by `authenticate()`.
 * Raw bearer tokens are intentionally excluded from this contract.
 */
export interface AuthSession {
  /**
   * Indicates that authentication completed successfully.
   */
  authenticated: true;

  /**
   * Token expiration timestamp in ISO 8601 format, or null for non-expiring tokens.
   */
  expiresAt: string | null;

  /**
   * Stable id of the Trust Provider used for this session.
   */
  trustProviderId: string;
}
