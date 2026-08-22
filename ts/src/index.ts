// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
export { EdgeClient } from "./client/edge-client.js";
export { trustProviders } from "./trust-providers/index.js";
export {
  createAwsMetadataServiceTrustProvider,
  createAwsRoleTrustProvider,
  createAzureMetadataServiceTrustProvider,
  createGcpIdentityTokenTrustProvider,
  createGitHubIdentityTokenTrustProvider,
  createOidcIdTokenTrustProvider,
} from "./trust-providers/index.js";
export type {
  AwsMetadataServiceTrustProviderOptions,
  AwsRoleTrustProviderOptions,
  AzureMetadataServiceTrustProviderOptions,
  GcpIdentityTokenTrustProviderOptions,
  GitHubIdentityTokenTrustProviderOptions,
  OidcIdTokenTrustProviderOptions,
} from "./trust-providers/index.js";

export type { AuthSession } from "./types/auth.js";
export type { EdgeClientConfig } from "./types/client-config.js";
export type {
  ConnectionMetadata,
  CredentialResult,
  CredentialServerRef,
  GetCredentialInput,
  GetCredentialOptions,
} from "./types/credential.js";
export type {
  ApiErrorLike,
  AuthErrorLike,
  CredentialErrorLike,
  EdgeErrorKind,
  EdgeSdkErrorLike,
  TransportErrorLike,
  TrustProviderErrorLike,
} from "./types/errors.js";
export type { RetryPolicy, RetryPolicyOverride } from "./types/retry.js";
export type { AembitLogger, LogContext } from "./types/logger.js";
export type {
  ClientWorkloadDetails,
  TrustProvider,
  TrustProviderKind,
} from "./types/trust-provider.js";
