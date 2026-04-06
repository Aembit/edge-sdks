"""Credential request and response parsing helpers."""

from typing import Literal, cast

from ...credentials import CredentialServerRef
from ...errors import CredentialError
from ..protocol.types import EdgeCredentialsSuccessBody, EdgeServerWorkloadDetails
from ..shared import is_string_key_mapping


def normalize_server_ref(server: object) -> EdgeServerWorkloadDetails:
    """Validate and normalize the public server reference."""

    if not isinstance(server, CredentialServerRef):
        raise CredentialError("get_credential() requires a valid server object", retryable=False)

    host_value = cast(object, server.host)
    if not isinstance(host_value, str):
        raise CredentialError("get_credential() requires server.host", retryable=False)

    host = host_value.strip()
    if not host:
        raise CredentialError("get_credential() requires server.host", retryable=False)

    port = cast(object, server.port)
    if isinstance(port, bool) or not isinstance(port, int) or port <= 0 or port > 65535:
        raise CredentialError("get_credential() requires a valid server.port", retryable=False)

    transport_protocol_value = cast(object, server.transport_protocol)
    transport_protocol = "TCP" if transport_protocol_value is None else transport_protocol_value
    if transport_protocol != "TCP":
        raise CredentialError(
            "Unsupported server.transport_protocol. Only 'TCP' is supported",
            retryable=False,
        )
    normalized_transport_protocol: Literal["TCP"] = "TCP"

    return {
        "host": host,
        "port": port,
        "transportProtocol": normalized_transport_protocol,
    }


def parse_credential_success_body(response: object) -> EdgeCredentialsSuccessBody:
    """Validate credential success payload structure."""

    if not is_string_key_mapping(response):
        raise CredentialError(
            "Edge credential response payload must be an object",
            retryable=False,
        )

    credential_type = response.get("credentialType")
    expires_at = response.get("expiresAt")
    data = response.get("data")

    if "credentialType" in response and not isinstance(credential_type, str):
        raise CredentialError(
            "Edge credential response field 'credentialType' must be a string when provided",
            retryable=False,
        )
    if expires_at is not None and not isinstance(expires_at, str):
        raise CredentialError(
            "Edge credential response field 'expiresAt' must be a string or null when provided",
            retryable=False,
        )
    if "data" in response and not is_string_key_mapping(data):
        raise CredentialError(
            "Edge credential response field 'data' must be an object when provided",
            retryable=False,
        )

    return cast(EdgeCredentialsSuccessBody, dict(response))
