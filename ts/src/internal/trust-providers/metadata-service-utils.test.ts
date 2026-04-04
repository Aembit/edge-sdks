import { describe, expect, it } from "vitest"

import { TrustProviderError } from "../protocol/errors.js"
import {
  createMetadataServiceHttpError,
  isMetadataServiceNetworkError,
  resolveMetadataServiceProviderId,
  resolveMetadataServiceTimeoutMs
} from "./metadata-service-utils.js"

describe("resolveMetadataServiceProviderId", () => {
  it("returns the provided id when non-empty", () => {
    expect(resolveMetadataServiceProviderId("custom-id", "default-id")).toBe("custom-id")
  })

  it("falls back to the default id for empty input", () => {
    expect(resolveMetadataServiceProviderId("   ", "default-id")).toBe("default-id")
  })
})

describe("resolveMetadataServiceTimeoutMs", () => {
  it("returns the floored timeout when positive and finite", () => {
    expect(resolveMetadataServiceTimeoutMs(12.9, 1000)).toBe(12)
  })

  it("clamps positive fractional values below 1ms up to 1ms", () => {
    expect(resolveMetadataServiceTimeoutMs(0.5, 1000)).toBe(1)
  })

  it("falls back to the default timeout for invalid values", () => {
    expect(resolveMetadataServiceTimeoutMs(undefined, 1000)).toBe(1000)
    expect(resolveMetadataServiceTimeoutMs(0, 1000)).toBe(1000)
    expect(resolveMetadataServiceTimeoutMs(Number.NaN, 1000)).toBe(1000)
  })
})

describe("createMetadataServiceHttpError", () => {
  it("creates a non-retryable error for non-retryable status codes", () => {
    const error = createMetadataServiceHttpError({
      providerLabel: "AWS Metadata Service",
      operationName: "IMDSv2 token",
      statusCode: 401
    })

    expect(error).toBeInstanceOf(TrustProviderError)
    expect(error).toMatchObject({
      kind: "trust_provider",
      statusCode: 401,
      retryable: false
    })
    expect(error.message).toBe("AWS Metadata Service IMDSv2 token request failed with status 401")
  })

  it("creates a retryable error for built-in retryable status codes", () => {
    const error = createMetadataServiceHttpError({
      providerLabel: "Azure Metadata Service",
      operationName: "attested document",
      statusCode: 500
    })

    expect(error).toMatchObject({
      statusCode: 500,
      retryable: true
    })
  })

  it("supports additional retryable status codes from policy", () => {
    const error = createMetadataServiceHttpError({
      providerLabel: "Azure Metadata Service",
      operationName: "attested document",
      statusCode: 409,
      retryableStatusCodes: [409]
    })

    expect(error).toMatchObject({
      statusCode: 409,
      retryable: true
    })
  })
})

describe("isMetadataServiceNetworkError", () => {
  it("returns true for TypeError", () => {
    expect(isMetadataServiceNetworkError(new TypeError("network failed"))).toBe(true)
  })

  it("returns false for non-TypeError values", () => {
    expect(isMetadataServiceNetworkError(new Error("other failure"))).toBe(false)
    expect(isMetadataServiceNetworkError("bad")).toBe(false)
  })
})
