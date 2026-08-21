// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
/**
 * Coarse-grained error classification exposed by the SDK.
 */
export type EdgeErrorKind =
  | "transport"
  | "api"
  | "auth"
  | "credential"
  | "trust_provider"
  | "unknown";

/**
 * Common error contract used by SDK-specific error implementations.
 */
export interface EdgeSdkErrorLike extends Error {
  /**
   * Error category for branching and logging.
   */
  readonly kind: EdgeErrorKind;

  /**
   * HTTP status code, when the error originated from an HTTP response.
   */
  readonly statusCode?: number;

  /**
   * API-defined error code, when provided by Edge.
   */
  readonly apiCode?: string;

  /**
   * Request correlation id, when available.
   */
  readonly requestId?: string;

  /**
   * Indicates whether retry may succeed for this failure.
   */
  readonly retryable?: boolean;

  /**
   * Underlying error cause from lower layers.
   */
  readonly cause?: unknown;
}

/**
 * Error contract for transport/network failures.
 */
export interface TransportErrorLike extends EdgeSdkErrorLike {
  readonly kind: "transport";
}

/**
 * Error contract for API response failures.
 */
export interface ApiErrorLike extends EdgeSdkErrorLike {
  readonly kind: "api";
}

/**
 * Error contract for authentication-specific failures.
 */
export interface AuthErrorLike extends EdgeSdkErrorLike {
  readonly kind: "auth";
}

/**
 * Error contract for credential retrieval failures.
 */
export interface CredentialErrorLike extends EdgeSdkErrorLike {
  readonly kind: "credential";
}

/**
 * Error contract for Trust Provider failures.
 */
export interface TrustProviderErrorLike extends EdgeSdkErrorLike {
  readonly kind: "trust_provider";
}
