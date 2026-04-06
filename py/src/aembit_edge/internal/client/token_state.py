"""Token lifecycle helpers."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone

from ...retry import RetryPolicy
from ..protocol.retry import (
    merge_retry_overrides,
    merge_retry_policy,
    serialize_effective_retry_policy,
)

DEFAULT_AUTH_EXPIRY_SKEW_MS = 60_000


@dataclass(slots=True, kw_only=True)
class CachedTokenState:
    """Cached auth token state for a client instance."""

    access_token: str
    expires_at_ms: int | None
    resource_set: str | None = None
    auth_cache_key: str | None = None


def resolve_auth_expiry_skew_ms(value: object) -> int:
    """Resolve configured token expiry skew in milliseconds."""

    if value is None:
        return DEFAULT_AUTH_EXPIRY_SKEW_MS

    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return DEFAULT_AUTH_EXPIRY_SKEW_MS

    if value < 0:
        return DEFAULT_AUTH_EXPIRY_SKEW_MS

    return int(value)


def is_token_valid(
    token_state: CachedTokenState | None,
    now_ms: int,
    skew_ms: int,
) -> bool:
    """Return true when cached token state is still valid for use."""

    if token_state is None:
        return False

    if token_state.expires_at_ms is None:
        return True

    return now_ms < token_state.expires_at_ms - skew_ms


def format_expires_at(expires_at_ms: int | None) -> str | None:
    """Format an optional expiry timestamp as an ISO 8601 string."""

    if expires_at_ms is None:
        return None

    return (
        datetime.fromtimestamp(expires_at_ms / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def resolve_effective_resource_set(
    default_resource_set: str | None,
    request_resource_set: str | None,
) -> str | None:
    """Resolve request-level Resource Set override against client default."""

    return request_resource_set if request_resource_set is not None else default_resource_set


def serialize_auth_single_flight_key(
    *,
    resource_set: str | None,
    auth_cache_key: str | None,
    retry_key: str,
) -> str:
    """Serialize the auth single-flight key used for de-duplication."""

    return json.dumps(
        [resource_set, auth_cache_key, retry_key],
        separators=(",", ":"),
    )


def serialize_effective_retry_policy_key(
    *,
    base_retry: RetryPolicy | None,
    request_retry: RetryPolicy | None,
) -> str:
    """Serialize the merged effective retry policy into a stable cache key."""

    merged_override = merge_retry_overrides(base_retry, request_retry)
    effective_retry = merge_retry_policy(merged_override)
    return serialize_effective_retry_policy(effective_retry)
