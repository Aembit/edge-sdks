/**
 * Provider identifier strings are intentionally open-ended for forward compatibility.
 */
export type TrustProviderKind =
  | "aws_metadata_service"
  | "aws_role"
  | "oidc_id_token"
  | (string & {});

/**
 * Identity payload sent as the `client` object in `/edge/v1/auth` requests.
 * This remains flexible to preserve compatibility with Trust Provider-specific fields.
 */
export type ClientWorkloadDetails = Record<string, unknown>;

export interface CollectedTrustProviderIdentity {
  /**
   * Provider-specific client workload identity payload.
   */
  readonly client: ClientWorkloadDetails;

  /**
   * Optional cache key that scopes auth-session reuse for this identity.
   *
   * When omitted, `EdgeClient` falls back to the previous behavior of caching
   * only by Resource Set and retry policy.
   */
  readonly authCacheKey?: string;
}

export interface TrustProvider {
  /**
   * Stable provider id for logging/telemetry and session metadata.
   */
  readonly id: string;

  /**
   * Canonical provider kind used for behavior selection and diagnostics.
   */
  readonly kind: TrustProviderKind;

  /**
   * Collect provider-specific client workload identity data.
   */
  collectIdentity(): Promise<ClientWorkloadDetails>;

  /**
   * Optionally collect provider-specific identity data together with metadata
   * that scopes auth-session reuse for dynamic identities.
   */
  collectIdentityWithMetadata?(): Promise<CollectedTrustProviderIdentity>;
}
