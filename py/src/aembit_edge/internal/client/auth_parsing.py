"""Authentication response parsing helpers."""

import math
from typing import cast

from ...errors import AuthError
from ..protocol.types import EdgeAuthSuccessBody
from ..shared import is_string_key_mapping


def parse_access_token(token: str | None) -> str:
    """Parse and validate an access token from `/edge/v1/auth`."""

    value = token.strip() if isinstance(token, str) else ""
    if not value:
        raise AuthError("Edge auth response missing accessToken", retryable=False)

    return value


def parse_auth_success_body(response: object) -> EdgeAuthSuccessBody:
    """Validate auth success payload structure."""

    if not is_string_key_mapping(response):
        raise AuthError("Edge auth response payload must be an object", retryable=False)

    access_token = response.get("accessToken")
    token_type = response.get("tokenType")
    expires_in = response.get("expiresIn")

    if access_token is not None and not isinstance(access_token, str):
        raise AuthError(
            "Edge auth response field 'accessToken' must be a string when provided",
            retryable=False,
        )
    if token_type is not None and not isinstance(token_type, str):
        raise AuthError(
            "Edge auth response field 'tokenType' must be a string when provided",
            retryable=False,
        )
    if expires_in is not None and (
        isinstance(expires_in, bool)
        or not isinstance(expires_in, (int, float))
        or not math.isfinite(expires_in)
    ):
        raise AuthError(
            "Edge auth response field 'expiresIn' must be a number when provided",
            retryable=False,
        )

    return cast(EdgeAuthSuccessBody, dict(response))


def calculate_expires_at_ms(expires_in_seconds: int | float | None, now_ms: int) -> int | None:
    """Resolve auth token expiry timestamp in milliseconds."""

    if expires_in_seconds is None:
        return None

    if not math.isfinite(expires_in_seconds) or expires_in_seconds < 0:
        raise AuthError("Edge auth response contains invalid expiresIn", retryable=False)

    return now_ms + round(expires_in_seconds * 1000)
