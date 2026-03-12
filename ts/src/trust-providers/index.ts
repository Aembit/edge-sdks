import { createAwsMetadataServiceTrustProvider } from "../internal/trust-providers/aws-metadata-service.js"
import { createAwsRoleTrustProvider } from "../internal/trust-providers/aws-role.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider,
  awsRole: createAwsRoleTrustProvider
}

export type { AwsMetadataServiceTrustProviderOptions } from "../internal/trust-providers/aws-metadata-service.js"
export type { AwsRoleTrustProviderOptions } from "../internal/trust-providers/aws-role.js"
