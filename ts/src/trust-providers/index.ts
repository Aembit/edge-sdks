// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
import { createAwsRoleTrustProvider } from "./aws-role.js"
import { createAzureMetadataServiceTrustProvider } from "./azure-metadata-service.js"
import { createGcpIdentityTokenTrustProvider } from "./gcp-identity-token.js"
import { createGitHubIdentityTokenTrustProvider } from "./github-identity-token.js"
import { createGitLabIdentityTokenTrustProvider } from "./gitlab-identity-token.js"
import { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider,
  awsRole: createAwsRoleTrustProvider,
  azureMetadataService: createAzureMetadataServiceTrustProvider,
  gcpIdentityToken: createGcpIdentityTokenTrustProvider,
  githubIdentityToken: createGitHubIdentityTokenTrustProvider,
  gitlabIdentityToken: createGitLabIdentityTokenTrustProvider,
  oidcIdToken: createOidcIdTokenTrustProvider
}

export { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
export { createAwsRoleTrustProvider } from "./aws-role.js"
export { createAzureMetadataServiceTrustProvider } from "./azure-metadata-service.js"
export { createGcpIdentityTokenTrustProvider } from "./gcp-identity-token.js"
export { createGitHubIdentityTokenTrustProvider } from "./github-identity-token.js"
export { createGitLabIdentityTokenTrustProvider } from "./gitlab-identity-token.js"
export { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

export type { AwsMetadataServiceTrustProviderOptions } from "./aws-metadata-service.js"
export type { AwsRoleTrustProviderOptions } from "./aws-role.js"
export type { AzureMetadataServiceTrustProviderOptions } from "./azure-metadata-service.js"
export type { GcpIdentityTokenTrustProviderOptions } from "./gcp-identity-token.js"
export type { GitHubIdentityTokenTrustProviderOptions } from "./github-identity-token.js"
export type { GitLabIdentityTokenTrustProviderOptions } from "./gitlab-identity-token.js"
export type { OidcIdTokenTrustProviderOptions } from "./oidc-id-token.js"
