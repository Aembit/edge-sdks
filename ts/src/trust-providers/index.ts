import { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
import { createAwsRoleTrustProvider } from "./aws-role.js"
import { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider,
  awsRole: createAwsRoleTrustProvider,
  oidcIdToken: createOidcIdTokenTrustProvider
}

export { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
export { createAwsRoleTrustProvider } from "./aws-role.js"
export { createOidcIdTokenTrustProvider } from "./oidc-id-token.js"

export type { AwsMetadataServiceTrustProviderOptions } from "./aws-metadata-service.js"
export type { AwsRoleTrustProviderOptions } from "./aws-role.js"
export type { OidcIdTokenTrustProviderOptions } from "./oidc-id-token.js"
