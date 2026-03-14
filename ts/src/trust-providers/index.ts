import { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
import { createAwsRoleTrustProvider } from "./aws-role.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider,
  awsRole: createAwsRoleTrustProvider
}

export { createAwsMetadataServiceTrustProvider } from "./aws-metadata-service.js"
export { createAwsRoleTrustProvider } from "./aws-role.js"

export type { AwsMetadataServiceTrustProviderOptions } from "./aws-metadata-service.js"
export type { AwsRoleTrustProviderOptions } from "./aws-role.js"
