// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest"

import { buildAwsStsGetCallerIdentitySignedData } from "./aws-role-signer.js"

describe("buildAwsStsGetCallerIdentitySignedData", () => {
  it("builds signed STS headers for GetCallerIdentity", async () => {
    const result = await buildAwsStsGetCallerIdentitySignedData({
      region: "us-east-1",
      credentialsProvider: async () => ({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        sessionToken: "session-token-1"
      }),
      now: () => new Date("2026-03-12T10:15:30Z")
    })

    expect(result.region).toBe("us-east-1")
    expect(result.headers.host).toBe("sts.us-east-1.amazonaws.com")
    expect(result.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded; charset=utf-8"
    )
    expect(result.headers["x-amz-date"]).toBe("20260312T101530Z")
    expect(result.headers["x-amz-security-token"]).toBe("session-token-1")
    expect(result.headers.authorization).toContain("AWS4-HMAC-SHA256")
    expect(result.headers.authorization).toContain(
      "Credential=AKIDEXAMPLE/20260312/us-east-1/sts/aws4_request"
    )
  })

  it("uses partition-aware STS host for AWS China regions", async () => {
    const result = await buildAwsStsGetCallerIdentitySignedData({
      region: "cn-north-1",
      credentialsProvider: async () => ({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
      }),
      now: () => new Date("2026-03-12T10:15:30Z")
    })

    expect(result.headers.host).toBe("sts.cn-north-1.amazonaws.com.cn")
    expect(result.headers.authorization).toContain(
      "Credential=AKIDEXAMPLE/20260312/cn-north-1/sts/aws4_request"
    )
  })

  it("keeps standard STS host format for GovCloud regions", async () => {
    const result = await buildAwsStsGetCallerIdentitySignedData({
      region: "us-gov-west-1",
      credentialsProvider: async () => ({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
      }),
      now: () => new Date("2026-03-12T10:15:30Z")
    })

    expect(result.headers.host).toBe("sts.us-gov-west-1.amazonaws.com")
    expect(result.headers.authorization).toContain(
      "Credential=AKIDEXAMPLE/20260312/us-gov-west-1/sts/aws4_request"
    )
  })

  it("omits x-amz-security-token when session token is not present", async () => {
    const result = await buildAwsStsGetCallerIdentitySignedData({
      region: "us-west-2",
      credentialsProvider: async () => ({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
      }),
      now: () => new Date("2026-03-12T10:15:30Z")
    })

    expect(result.headers["x-amz-security-token"]).toBeUndefined()
    expect(result.headers.authorization).toContain(
      "Credential=AKIDEXAMPLE/20260312/us-west-2/sts/aws4_request"
    )
  })

  it("trims and validates region", async () => {
    const result = await buildAwsStsGetCallerIdentitySignedData({
      region: " eu-central-1 ",
      credentialsProvider: async () => ({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "secret"
      }),
      now: () => new Date("2026-03-12T10:15:30Z")
    })

    expect(result.region).toBe("eu-central-1")

    await expect(
      buildAwsStsGetCallerIdentitySignedData({
        region: "  ",
        credentialsProvider: async () => ({
          accessKeyId: "AKIDEXAMPLE",
          secretAccessKey: "secret"
        })
      })
    ).rejects.toThrow("AWS Role Trust Provider requires a non-empty region")
  })

  it("fails when credential provider returns missing key fields", async () => {
    await expect(
      buildAwsStsGetCallerIdentitySignedData({
        region: "us-east-1",
        credentialsProvider: async () => ({
          accessKeyId: " ",
          secretAccessKey: "secret"
        })
      })
    ).rejects.toThrow("AWS credential provider returned an empty accessKeyId")

    await expect(
      buildAwsStsGetCallerIdentitySignedData({
        region: "us-east-1",
        credentialsProvider: async () => ({
          accessKeyId: "AKIDEXAMPLE",
          secretAccessKey: " "
        })
      })
    ).rejects.toThrow("AWS credential provider returned an empty secretAccessKey")
  })
})
