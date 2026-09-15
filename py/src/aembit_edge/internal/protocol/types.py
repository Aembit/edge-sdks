# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Protocol-aligned request and response types for Aembit Edge API v1."""

from dataclasses import dataclass
from typing import Generic, Literal, TypeAlias, TypedDict, TypeVar

from ...trust_providers import ClientWorkloadDetails
from ...types import JsonObject

EdgeOperation: TypeAlias = Literal["auth", "credentials", "api"]
EdgeAuthPath: TypeAlias = Literal["/edge/v1/auth"]
EdgeCredentialsPath: TypeAlias = Literal["/edge/v1/credentials"]


class EdgeGenericErrorBody(TypedDict, total=False):
    """Generic API error body contract for non-2xx responses."""

    success: bool
    message: str | None
    id: int


class EdgeAuthRequestBody(TypedDict):
    """`/edge/v1/auth` request body."""

    clientId: str
    client: ClientWorkloadDetails


class EdgeAuthSuccessBody(TypedDict, total=False):
    """`/edge/v1/auth` success body."""

    accessToken: str | None
    tokenType: str | None
    expiresIn: int


class EdgeServerWorkloadDetails(TypedDict, total=False):
    """Target server details for `/edge/v1/credentials`."""

    transportProtocol: Literal["TCP"]
    host: str
    port: int


class ConnectionMetadata(TypedDict, total=False):
    """Filter values for multi-credential provider access policy credential requests.

    Field names match the Aembit Edge wire protocol (camelCase):
    - accountName: Snowflake username selector to filter on.
    - accessKeyId: AWS access key ID selector used to disambiguate among multiple
      AWS STS credential providers configured for the target server workload.
    - headerName: HTTP header name to filter on.
    - headerValue: HTTP header value to filter on.
    - httpBodyFieldPath: HTTP request body field JSON path to filter on.
    - httpBodyFieldValue: HTTP request body field value to filter on.
    """

    accountName: str | None
    accessKeyId: str | None
    headerName: str | None
    headerValue: str | None
    httpBodyFieldPath: str | None
    httpBodyFieldValue: str | None


class EdgeCredentialsRequestBody(TypedDict, total=False):
    """`/edge/v1/credentials` request body."""

    client: ClientWorkloadDetails
    server: EdgeServerWorkloadDetails
    credentialType: str
    connectionMetadata: ConnectionMetadata
    certSigningRequest: str | None


class EdgeCredentialsSuccessBody(TypedDict, total=False):
    """`/edge/v1/credentials` success body."""

    credentialType: str
    expiresAt: str | None
    data: JsonObject


EdgeResponseHeaders: TypeAlias = dict[str, str | None]

TBody = TypeVar("TBody")


@dataclass(slots=True, kw_only=True)
class EdgeSuccessResponse(Generic[TBody]):
    """Normalized successful protocol response."""

    status: int
    body: TBody
    headers: EdgeResponseHeaders
    ok: Literal[True] = True


@dataclass(slots=True, kw_only=True)
class EdgeErrorResponse(Generic[TBody]):
    """Normalized error protocol response."""

    status: int
    body: TBody
    headers: EdgeResponseHeaders
    ok: Literal[False] = False


EdgeAuthResponse: TypeAlias = (
    EdgeSuccessResponse[EdgeAuthSuccessBody] | EdgeErrorResponse[EdgeGenericErrorBody]
)
EdgeCredentialsResponse: TypeAlias = (
    EdgeSuccessResponse[EdgeCredentialsSuccessBody] | EdgeErrorResponse[EdgeGenericErrorBody]
)
