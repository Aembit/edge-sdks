// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { ConnectionMetadata } from "../internal/protocol/types.js";
import type { RetryPolicyOverride } from "./retry.js";

export type { ConnectionMetadata };

/**
 * Server reference used by `getCredential()`.
 */
export interface CredentialServerRef {
  /**
   * Target server hostname or IP address.
   */
  host: string;

  /**
   * Target server port.
   */
  port: number;

  /**
   * Transport protocol for the target server. Only `TCP` is currently supported.
   */
  transportProtocol?: "TCP";
}

/**
 * Public input contract for credential retrieval.
 */
export interface GetCredentialInput {
  /**
   * Target server/service descriptor.
   */
  server: CredentialServerRef;

  /**
   * Optional credential type hint requested from Edge.
   */
  credentialType?: string;

  /**
   * Optional filter metadata for access policies with multiple credential providers.
   */
  connectionMetadata?: ConnectionMetadata;

  /**
   * Optional Certificate Signing Request (CSR) for X.509 SVID credential flows.
   */
  certSigningRequest?: string | null;
}

/**
 * Optional per-call behavior overrides for credential retrieval.
 */
export interface GetCredentialOptions {
  /**
   * Optional Resource Set override for this request.
   */
  resourceSet?: string;

  /**
   * Optional retry override for this request.
   */
  retry?: RetryPolicyOverride;
}

/**
 * Public credential retrieval result.
 */
export interface CredentialResult {
  /**
   * Credential type returned by Edge, when available.
   */
  credentialType?: string;

  /**
   * Expiration timestamp in ISO 8601 format, or null for non-expiring credentials.
   */
  expiresAt?: string | null;

  /**
   * Provider-specific credential payload returned by Edge.
   */
  data: Record<string, unknown>;
}
