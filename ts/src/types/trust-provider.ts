/**
 * Provider identifier strings are intentionally open-ended for forward compatibility.
 */
export type TrustProviderKind =
  | "aws_metadata_service"
  | "aws_role"
  | (string & {});

/**
 * Identity payload sent as the `client` object in `/edge/v1/auth` requests.
 * This remains flexible to preserve compatibility with Trust Provider-specific fields.
 */
export type ClientWorkloadDetails = Record<string, unknown>;

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
}
