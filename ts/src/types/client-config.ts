// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { AembitLogger } from "./logger.js";
import type { RetryPolicyOverride } from "./retry.js";
import type { ClientWorkloadDetails, TrustProvider } from "./trust-provider.js";

/**
 * Public configuration contract for the SDK client.
 */
export interface EdgeClientConfig {
  /**
   * Base URL for the tenant Aembit Edge API (for example https://{tenant}.aembit.io).
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
   * Optional additional client workload details merged into the payload sent to Edge.
   */
  clientWorkloadDetails?: ClientWorkloadDetails;

  /**
   * Optional Resource Set value sent with Aembit Edge API requests.
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

  /**
   * Optional logger instance.
   * If not provided, SDK internal logging is completely silenced.
   */
  logger?: AembitLogger;
}
