# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Internal protocol and transport error mapping helpers."""

from __future__ import annotations

from collections.abc import Mapping

from ...errors import ApiError, AuthError, CredentialError, TransportError
from ..shared import is_string_key_mapping
from .retry import is_retryable_http_status
from .types import EdgeGenericErrorBody, EdgeOperation, EdgeResponseHeaders


def extract_edge_generic_error_body(body: object) -> EdgeGenericErrorBody | None:
    """Extract normalized fields from a generic API error body."""

    if not is_string_key_mapping(body):
        return None

    candidate = body
    message = candidate.get("message")
    success = candidate.get("success")
    identifier = candidate.get("id")

    normalized: EdgeGenericErrorBody = {}
    if isinstance(success, bool):
        normalized["success"] = success
    if message is None or isinstance(message, str):
        normalized["message"] = message
    if isinstance(identifier, int) and not isinstance(identifier, bool):
        normalized["id"] = identifier

    return normalized


def extract_request_id(
    headers: EdgeResponseHeaders | Mapping[str, str | None] | None,
) -> str | None:
    """Extract a request identifier from normalized response headers."""

    if headers is None:
        return None

    x_request_id: str | None = None
    request_id: str | None = None
    for key, value in headers.items():
        normalized = key.lower()
        if not value:
            continue
        if normalized == "x-request-id":
            x_request_id = value
        elif normalized == "request-id":
            request_id = value

    return x_request_id or request_id


def map_http_error(
    *,
    operation: EdgeOperation,
    status_code: int,
    body: object = None,
    headers: EdgeResponseHeaders | Mapping[str, str | None] | None = None,
    retry_on_status_codes: tuple[int, ...] = (),
    message: str | None = None,
) -> ApiError | AuthError | CredentialError:
    """Map a protocol HTTP failure into the public SDK exception hierarchy."""

    normalized_body = extract_edge_generic_error_body(body)
    request_id = extract_request_id(headers)
    api_code = None
    if normalized_body is not None and "id" in normalized_body:
        api_code = str(normalized_body["id"])
    error_message = (
        message
        or (
            normalized_body.get("message")
            if normalized_body is not None and "message" in normalized_body
            else None
        )
        or f"Edge API request failed with status {status_code}"
    )
    retryable = is_retryable_http_status(status_code, retry_on_status_codes)

    if operation == "auth":
        return AuthError(
            error_message,
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )
    if operation == "credentials":
        return CredentialError(
            error_message,
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )

    return ApiError(
        error_message,
        status_code=status_code,
        api_code=api_code,
        request_id=request_id,
        retryable=retryable,
    )


def map_transport_error(
    error: Exception,
    message: str = "Edge transport request failed",
    *,
    retryable: bool = True,
) -> TransportError:
    """Map a low-level transport exception into a public transport error."""

    if isinstance(error, TransportError):
        return error

    suffix = f": {error}" if str(error) else ""
    return TransportError(f"{message}{suffix}", retryable=retryable)
