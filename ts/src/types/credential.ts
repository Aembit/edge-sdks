import type { RetryPolicyOverride } from "./retry.js";

/**
 * Server reference used by `getCredential()`.
 * Fields are flexible to support multiple server identification patterns.
 */
export interface CredentialServerRef {
  id?: string;
  hostname?: string;
  labels?: Record<string, string>;
  [key: string]: unknown;
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
