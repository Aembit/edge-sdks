/**
 * Retry behavior contract for transport/protocol operations.
 */
export interface RetryPolicy {
  /**
   * Enables/disables retry behavior.
   */
  enabled: boolean;

  /**
   * Total number of attempts, including the first request.
   */
  maxAttempts: number;

  /**
   * Initial backoff delay in milliseconds.
   */
  baseDelayMs: number;

  /**
   * Maximum backoff delay in milliseconds.
   */
  maxDelayMs: number;

  /**
   * Enables jitter for backoff delays.
   */
  jitter: boolean;

  /**
   * Additional HTTP status codes to treat as retryable.
   */
  retryableStatusCodes?: number[];
}

/**
 * Partial retry override used in client config and per-call options.
 */
export type RetryPolicyOverride = Partial<RetryPolicy>;
