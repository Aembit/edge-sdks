import type { ClientWorkloadDetails } from "../../types/trust-provider.js";

/**
 * Edge API v1 endpoint paths used by the protocol layer.
 */
export type EdgeAuthPath = "/edge/v1/auth";
export type EdgeCredentialsPath = "/edge/v1/credentials";

/**
 * Known status codes from `spec/openapi/api-1.yaml` (retrieved 2026-03-07T17:37:55Z).
 */
export type AuthSuccessStatus = 200;
export type AuthErrorStatus = 400 | 401 | 500;
export type CredentialsSuccessStatus = 200;
export type CredentialsErrorStatus = 400 | 500;

/**
 * Generic API error body contract for non-2xx responses.
 */
export interface EdgeGenericErrorBody {
  success?: boolean;
  message?: string | null;
  id?: number;
}

/**
 * `/edge/v1/auth` request body.
 */
export interface EdgeAuthRequestBody {
  clientId: string;
  client: ClientWorkloadDetails;
}

/**
 * `/edge/v1/auth` success body (`TokenDTO`).
 */
export interface EdgeAuthSuccessBody {
  accessToken?: string | null;
  tokenType?: string | null;
  expiresIn?: number;
}

/**
 * Target server details for `/edge/v1/credentials`.
 */
export interface EdgeServerWorkloadDetails {
  transportProtocol?: "TCP";
  host?: string | null;
  port?: number;
}

/**
 * `/edge/v1/credentials` request body.
 */
export interface EdgeCredentialsRequestBody {
  client: ClientWorkloadDetails;
  server: EdgeServerWorkloadDetails;
  credentialType?: string;
}

/**
 * `/edge/v1/credentials` success body (`ApiCredentialsResponse`).
 */
export interface EdgeCredentialsSuccessBody {
  credentialType?: string;
  expiresAt?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Internal normalized response headers map.
 */
export type EdgeResponseHeaders = Record<string, string | undefined>;

export interface EdgeSuccessResponse<TStatus extends number, TBody> {
  ok: true;
  status: TStatus;
  body: TBody;
  headers: EdgeResponseHeaders;
}

export interface EdgeErrorResponse<TStatus extends number, TBody = EdgeGenericErrorBody> {
  ok: false;
  status: TStatus;
  body: TBody;
  headers: EdgeResponseHeaders;
}

export type EdgeAuthResponse =
  | EdgeSuccessResponse<AuthSuccessStatus, EdgeAuthSuccessBody>
  | EdgeErrorResponse<AuthErrorStatus>;

export type EdgeCredentialsResponse =
  | EdgeSuccessResponse<CredentialsSuccessStatus, EdgeCredentialsSuccessBody>
  | EdgeErrorResponse<CredentialsErrorStatus>;
