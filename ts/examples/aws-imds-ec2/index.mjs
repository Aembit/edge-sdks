import { EdgeClient, trustProviders } from "../../dist/index.js"

/**
 * Minimal end-to-end SDK integration flow for EC2 + AWS IMDSv2.
 *
 * Required env vars:
 * - AEMBIT_EDGE_BASE_URL
 * - AEMBIT_CLIENT_ID
 * - AEMBIT_SERVER_HOST
 * - AEMBIT_SERVER_PORT
 * - AEMBIT_CREDENTIAL_TYPE
 *
 * Optional env vars:
 * - AEMBIT_RESOURCE_SET_ID
 */
async function main() {
  const baseUrl = getRequiredEnv("AEMBIT_EDGE_BASE_URL")
  const clientId = getRequiredEnv("AEMBIT_CLIENT_ID")
  const serverHost = getRequiredEnv("AEMBIT_SERVER_HOST")
  const serverPort = parseRequiredPort("AEMBIT_SERVER_PORT")
  const credentialType = getRequiredEnv("AEMBIT_CREDENTIAL_TYPE")
  const resourceSet = getOptionalEnv("AEMBIT_RESOURCE_SET_ID")
  const printCredentialJson = parseOptionalBoolean("AEMBIT_PRINT_CREDENTIAL_JSON", false)

  // 1) Create an EdgeClient with the built-in AWS Metadata Service Trust Provider.
  const client = new EdgeClient({
    baseUrl,
    clientId,
    trustProvider: trustProviders.awsMetadataService(),
    resourceSet
  })

  // 2) Explicitly authenticate the current workload.
  const session = await client.authenticate()
  console.log("Authenticated session:", {
    authenticated: session.authenticated,
    expiresAt: session.expiresAt,
    trustProviderId: session.trustProviderId
  })

  // 3) Request credentials for the target service endpoint.
  const credential = await client.getCredential({
    server: {
      host: serverHost,
      port: serverPort
    },
    credentialType
  })

  // 4) Print safe summary by default, or full credential JSON when explicitly requested.
  if (printCredentialJson) {
    console.log(
      JSON.stringify(
        {
          credentialType: credential.credentialType ?? null,
          expiresAt: credential.expiresAt ?? null,
          data: credential.data
        },
        null,
        2
      )
    )
    return
  }

  console.log(
    JSON.stringify(
      {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        dataKeys: Object.keys(credential.data)
      },
      null,
      2
    )
  )
  console.log("Set AEMBIT_PRINT_CREDENTIAL_JSON=true to print full credential data.")
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function parseRequiredPort(name) {
  const value = Number.parseInt(getRequiredEnv(name), 10)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  return value
}

function getOptionalEnv(name) {
  const value = process.env[name]
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseOptionalBoolean(name, defaultValue = false) {
  const raw = getOptionalEnv(name)
  if (!raw) {
    return defaultValue
  }

  const normalized = raw.toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false
  }

  throw new Error(`${name} must be one of: true/false, 1/0, yes/no`)
}

function logStructuredError(error) {
  if (!error || typeof error !== "object") {
    console.error("Unexpected error:", error)
    return
  }

  const hasKind = "kind" in error
  if (!hasKind) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(message)
    return
  }

  const sdkError = /** @type {{ kind?: unknown, message?: unknown, retryable?: unknown, statusCode?: unknown, apiCode?: unknown, requestId?: unknown }} */ (error)
  console.error("SDK request failed:")
  console.error(
    JSON.stringify(
      {
        kind: sdkError.kind,
        message: sdkError.message,
        retryable: sdkError.retryable,
        statusCode: sdkError.statusCode,
        apiCode: sdkError.apiCode,
        requestId: sdkError.requestId
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  logStructuredError(error)
  process.exitCode = 1
})
