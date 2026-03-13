import { EdgeClient, trustProviders } from "../../dist/index.js"

export interface ExampleEvent {
  serverHost?: string
  serverPort?: number
  credentialType?: string
  resourceSet?: string
}

export interface ExampleCredentialPayload {
  credentialType: string | null
  expiresAt: string | null
  data: Record<string, unknown>
}

export interface ExampleResponse {
  authenticated: true
  trustProviderId: string
  credentialType: string | null
  credentialExpiresAt: string | null
  dataKeys?: string[]
  credential?: ExampleCredentialPayload
}

let cachedClient: EdgeClient | undefined
let cachedTrustProviderId: string | undefined

export async function handler(event: ExampleEvent = {}): Promise<ExampleResponse> {
  const client = getClient()
  const request = resolveRequestInput(event)
  const credential = await client.getCredential(
    {
      server: {
        host: request.serverHost,
        port: request.serverPort
      },
      credentialType: request.credentialType
    },
    {
      resourceSet: request.resourceSet
    }
  )

  const baseResponse = {
    authenticated: true as const,
    trustProviderId: getTrustProviderId(),
    credentialType: credential.credentialType ?? null,
    credentialExpiresAt: credential.expiresAt ?? null
  }

  if (parseOptionalBoolean("AEMBIT_PRINT_CREDENTIAL_JSON", false)) {
    return {
      ...baseResponse,
      credential: {
        credentialType: credential.credentialType ?? null,
        expiresAt: credential.expiresAt ?? null,
        data: credential.data
      }
    }
  }

  return {
    ...baseResponse,
    dataKeys: Object.keys(credential.data)
  }
}

function getClient(): EdgeClient {
  if (cachedClient) {
    return cachedClient
  }

  const trustProvider = trustProviders.awsRole({
    region: resolveAwsRegion()
  })
  cachedTrustProviderId = trustProvider.id

  cachedClient = new EdgeClient({
    baseUrl: getRequiredEnv("AEMBIT_EDGE_BASE_URL"),
    clientId: getRequiredEnv("AEMBIT_CLIENT_ID"),
    trustProvider,
    resourceSet: getOptionalEnv("AEMBIT_RESOURCE_SET_ID")
  })

  return cachedClient
}

function getTrustProviderId(): string {
  if (!cachedTrustProviderId) {
    throw new Error("Trust Provider id is unavailable before client initialization")
  }

  return cachedTrustProviderId
}

function resolveRequestInput(event: ExampleEvent) {
  return {
    serverHost: getOptionalString(event.serverHost) ?? getRequiredEnv("AEMBIT_SERVER_HOST"),
    serverPort: parsePortValue(event.serverPort, "event.serverPort")
      ?? parseRequiredPort("AEMBIT_SERVER_PORT"),
    credentialType:
      getOptionalString(event.credentialType) ?? getRequiredEnv("AEMBIT_CREDENTIAL_TYPE"),
    resourceSet: getOptionalString(event.resourceSet) ?? getOptionalEnv("AEMBIT_RESOURCE_SET_ID")
  }
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function parseRequiredPort(name: string): number {
  const parsed = parsePortValue(getRequiredEnv(name), name)
  if (typeof parsed !== "number") {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }

  return parsed
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return getOptionalString(value)
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parsePortValue(value: unknown, label: string): number | undefined {
  if (typeof value === "undefined") {
    return undefined
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 65535) {
      return value
    }

    throw new Error(`${label} must be an integer between 1 and 65535`)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return undefined
    }

    if (!/^[0-9]+$/.test(trimmed)) {
      throw new Error(`${label} must be an integer between 1 and 65535`)
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
      return parsed
    }
  }

  throw new Error(`${label} must be an integer between 1 and 65535`)
}

function parseOptionalBoolean(name: string, defaultValue: boolean): boolean {
  const value = getOptionalEnv(name)
  if (!value) {
    return defaultValue
  }

  const normalized = value.toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false
  }

  throw new Error(`${name} must be one of: true/false, 1/0, yes/no`)
}

function resolveAwsRegion(): string {
  const region =
    getOptionalEnv("AEMBIT_AWS_REGION")
    ?? getOptionalEnv("AWS_REGION")
    ?? getOptionalEnv("AWS_DEFAULT_REGION")

  if (!region) {
    throw new Error(
      "Missing AWS region. Set AEMBIT_AWS_REGION, AWS_REGION, or AWS_DEFAULT_REGION."
    )
  }

  return region
}
