import { createAwsMetadataServiceTrustProvider } from "../internal/trust-providers/aws-metadata-service.js"

/**
 * Built-in Trust Provider factory functions.
 */
export const trustProviders = {
  awsMetadataService: createAwsMetadataServiceTrustProvider
}

export type { AwsMetadataServiceTrustProviderOptions } from "../internal/trust-providers/aws-metadata-service.js"
