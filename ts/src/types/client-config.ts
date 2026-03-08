import type { RetryPolicyOverride } from "./retry.js";
import type { TrustProvider } from "./trust-provider.js";

/**
 * Public configuration contract for the SDK client.
 */
export interface EdgeClientConfig {
  /**
   * Base URL for the tenant Edge API (for example https://{tenant}.aembit.io).
   */
  baseUrl: string;

  /**
   * Trust Provider client identifier used by `/edge/v1/auth`.
   */
  clientId: string;

  /**
   * Runtime-specific Trust Provider implementation.
   */
  trustProvider: TrustProvider;

  /**
   * Optional Resource Set value sent with Edge API requests.
   */
  resourceSet?: string;

  /**
   * Request timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Token expiry skew in milliseconds.
   * Implementations should default to `60000` when this is not provided.
   */
  authExpirySkewMs?: number;

  /**
   * Global retry policy override.
   */
  retry?: RetryPolicyOverride;
}
