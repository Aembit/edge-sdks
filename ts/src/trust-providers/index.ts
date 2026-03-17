import { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
import { createAwsRoleTrustProvider } from "./aws-role.js"
import { createAzureMetadataServiceTrustProvider } from "./azure-metadata-service.js"
import { createGcpIdentityTokenTrustProvider } from "./gcp-identity-token.js"
import { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider,
  awsRole: createAwsRoleTrustProvider,
  azureMetadataService: createAzureMetadataServiceTrustProvider,
  gcpIdentityToken: createGcpIdentityTokenTrustProvider,
  oidcIdToken: createOidcIdTokenTrustProvider
}

export { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
export { createAwsRoleTrustProvider } from "./aws-role.js"
export { createAzureMetadataServiceTrustProvider } from "./azure-metadata-service.js"
export { createGcpIdentityTokenTrustProvider } from "./gcp-identity-token.js"
export { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

export type { AwsMetadataServiceTrustProviderOptions } from "./aws-metadata-service.js"
export type { AwsRoleTrustProviderOptions } from "./aws-role.js"
export type { AzureMetadataServiceTrustProviderOptions } from "./azure-metadata-service.js"
export type { GcpIdentityTokenTrustProviderOptions } from "./gcp-identity-token.js"
export type { OidcIdTokenTrustProviderOptions } from "./oidc-id-token.js"
