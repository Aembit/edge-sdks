import { CredentialError } from "../protocol/errors.js";
import type { EdgeCredentialsSuccessBody } from "../protocol/types.js";
import type { CredentialServerRef } from "../../types/credential.js";
import { isRecord } from "../shared/type-guards.js";

/**
 * Validates and normalizes public server reference input.
 */
export function normalizeServerRef(server: CredentialServerRef): {
  host: string;
  port: number;
  transportProtocol: "TCP";
} {
  if (!server || typeof server !== "object") {
    throw new CredentialError("getCredential() requires a valid server object", {
      retryable: false
    });
  }

  if (typeof server.host !== "string") {
    throw new CredentialError("getCredential() requires server.host", {
      retryable: false
    });
  }

  const host = server.host.trim();
  if (host.length === 0) {
    throw new CredentialError("getCredential() requires server.host", {
      retryable: false
    });
  }

  if (!Number.isInteger(server.port) || server.port <= 0 || server.port > 65535) {
    throw new CredentialError("getCredential() requires a valid server.port", {
      retryable: false
    });
  }

  const transportProtocol = server.transportProtocol ?? "TCP";
  if (transportProtocol !== "TCP") {
    throw new CredentialError(
      "Unsupported server.transportProtocol. Only 'TCP' is supported",
      {
        retryable: false
      }
    );
  }

  return {
    host,
    port: server.port,
    transportProtocol
  };
}

/**
 * Validates credential success payload structure.
 */
export function parseCredentialSuccessBody(
  response: EdgeCredentialsSuccessBody
): EdgeCredentialsSuccessBody {
  if (!isRecord(response)) {
    throw new CredentialError("Edge credential response payload must be an object", {
      retryable: false
    });
  }

  const credentialType = response.credentialType;
  if (credentialType !== undefined && typeof credentialType !== "string") {
    throw new CredentialError(
      "Edge credential response field 'credentialType' must be a string when provided",
      {
        retryable: false
      }
    );
  }

  const expiresAt = response.expiresAt;
  if (expiresAt !== undefined && expiresAt !== null && typeof expiresAt !== "string") {
    throw new CredentialError(
      "Edge credential response field 'expiresAt' must be a string or null when provided",
      {
        retryable: false
      }
    );
  }

  const data = response.data;
  if (data !== undefined && !isRecord(data)) {
    throw new CredentialError(
      "Edge credential response field 'data' must be an object when provided",
      {
        retryable: false
      }
    );
  }

  return {
    credentialType,
    expiresAt,
    data
  };
}
