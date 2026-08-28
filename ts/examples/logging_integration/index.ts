// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { AembitLogger, LogContext } from "@aembit/edge-sdk"
import { EdgeClient, createOidcIdTokenTrustProvider } from "@aembit/edge-sdk"

/**
 * Logging Integration Example for the TypeScript SDK.
 *
 * Demonstrates how to adapt popular structured logging engines (such as
 * Winston, Pino, or custom JSON loggers) to the SDK's `AembitLogger` interface.
 */

// --- 1. Custom / Structured JSON Logger Adapter ---
// Most logging libraries (Pino, Winston, Roarr) match this pattern.
function createStructuredJsonLogger(name: string): AembitLogger {
  function log(level: string, message: string, context?: LogContext): void {
    const entry = {
      timestamp: new Date().toISOString(),
      logger: name,
      level,
      message,
      ...(context ? { context } : {})
    }
    // In production, your host app's logger (e.g. pino, winston) handles the emission:
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx)
  }
}

// --- 2. Example Configuration ---
const EXAMPLE_CONFIG = {
  baseUrl: "https://<tenant>.ec.<stack>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  serverHost: "target.example.com",
  serverPort: 443,
  credentialType: "ApiKey",
  resourceSet: undefined as string | undefined
}

// Instantiate your structured logger
const appLogger = createStructuredJsonLogger("host-application")

// Instantiate a Trust Provider (e.g. OIDC ID Token, AWS Metadata Service, etc.)
const trustProvider = createOidcIdTokenTrustProvider({
  identityToken: () => Promise.resolve("dummy-id-token-for-example")
})

// --- 3. Inject the Logger into EdgeClient ---
const client = new EdgeClient({
  baseUrl: EXAMPLE_CONFIG.baseUrl,
  clientId: EXAMPLE_CONFIG.clientId,
  trustProvider,
  resourceSet: EXAMPLE_CONFIG.resourceSet,
  // Inject your custom logger here:
  logger: appLogger
})

async function main() {
  appLogger.info("Starting SDK logging integration example...")

  try {
    const credential = await client.getCredential(
      {
        server: {
          host: EXAMPLE_CONFIG.serverHost,
          port: EXAMPLE_CONFIG.serverPort
        },
        credentialType: EXAMPLE_CONFIG.credentialType
      },
      {
        resourceSet: EXAMPLE_CONFIG.resourceSet
      }
    )

    appLogger.info("Credential retrieved successfully", {
      credentialType: credential.credentialType,
      expiresAt: credential.expiresAt
    })
  } catch (error) {
    appLogger.error("Failed to retrieve credential", {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

void main()
