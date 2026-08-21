// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
export type {
  AuthErrorStatus,
  AuthSuccessStatus,
  CredentialsErrorStatus,
  CredentialsSuccessStatus,
  EdgeAuthPath,
  EdgeAuthRequestBody,
  EdgeAuthResponse,
  EdgeAuthSuccessBody,
  EdgeCredentialsPath,
  EdgeCredentialsRequestBody,
  EdgeCredentialsResponse,
  EdgeCredentialsSuccessBody,
  EdgeErrorResponse,
  EdgeGenericErrorBody,
  EdgeResponseHeaders,
  EdgeServerWorkloadDetails,
  EdgeSuccessResponse
} from "./types.js";

export {
  ApiError,
  AuthError,
  CredentialError,
  EdgeSdkError,
  TrustProviderError,
  TransportError,
  extractEdgeGenericErrorBody,
  extractRequestId,
  isRetryableStatusCode,
  mapHttpError,
  mapTransportError
} from "./errors.js";

export {
  DEFAULT_RETRY_POLICY,
  calculateBackoffDelayMs,
  executeWithRetry,
  isRetryableHttpStatus,
  mergeRetryPolicy,
  sleepMs
} from "./retry.js";
export type { RetryEvent } from "./retry.js";

export { EdgeHttpTransport } from "./http-transport.js";
export type {
  EdgeTransportMethod,
  EdgeTransportOptions,
  EdgeTransportRequest
} from "./http-transport.js";

export { EdgeApi } from "./edge-api.js";
export type { EdgeApiOptions, EdgeApiRequestOptions } from "./edge-api.js";
