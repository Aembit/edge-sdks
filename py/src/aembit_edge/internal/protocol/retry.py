"""Internal retry policy helpers."""

from __future__ import annotations

import json
import math
import random as random_module
from collections.abc import Callable
from dataclasses import dataclass

from ...errors import EdgeSdkError
from ...retry import RetryPolicy

DEFAULT_RETRYABLE_STATUS_CODES = (429,)


@dataclass(slots=True, kw_only=True)
class EffectiveRetryPolicy:
    """Normalized retry behavior used internally."""

    enabled: bool
    max_attempts: int
    base_delay_ms: int
    max_delay_ms: int
    retry_on_status_codes: tuple[int, ...]
    jitter: bool = True


DEFAULT_RETRY_POLICY = EffectiveRetryPolicy(
    enabled=True,
    max_attempts=3,
    base_delay_ms=200,
    max_delay_ms=2000,
    retry_on_status_codes=(),
    jitter=True,
)


def merge_retry_overrides(
    base: RetryPolicy | None,
    request: RetryPolicy | None,
) -> RetryPolicy | None:
    """Merge request-level retry overrides over client defaults."""

    if base is None and request is None:
        return None

    base_enabled = None if base is None else base.enabled
    base_max_attempts = None if base is None else base.max_attempts
    base_base_delay_ms = None if base is None else base.base_delay_ms
    base_max_delay_ms = None if base is None else base.max_delay_ms
    base_retry_on_status_codes = None if base is None else base.retry_on_status_codes

    request_enabled = None if request is None else request.enabled
    request_max_attempts = None if request is None else request.max_attempts
    request_base_delay_ms = None if request is None else request.base_delay_ms
    request_max_delay_ms = None if request is None else request.max_delay_ms
    request_retry_on_status_codes = None if request is None else request.retry_on_status_codes

    return RetryPolicy(
        enabled=base_enabled if request_enabled is None else request_enabled,
        max_attempts=base_max_attempts if request_max_attempts is None else request_max_attempts,
        base_delay_ms=base_base_delay_ms
        if request_base_delay_ms is None
        else request_base_delay_ms,
        max_delay_ms=base_max_delay_ms if request_max_delay_ms is None else request_max_delay_ms,
        retry_on_status_codes=(
            base_retry_on_status_codes
            if request_retry_on_status_codes is None
            else request_retry_on_status_codes
        ),
    )


def merge_retry_policy(override: RetryPolicy | None = None) -> EffectiveRetryPolicy:
    """Merge retry overrides with defaults and normalize invalid numeric values."""

    if override is None:
        return EffectiveRetryPolicy(
            enabled=DEFAULT_RETRY_POLICY.enabled,
            max_attempts=DEFAULT_RETRY_POLICY.max_attempts,
            base_delay_ms=DEFAULT_RETRY_POLICY.base_delay_ms,
            max_delay_ms=DEFAULT_RETRY_POLICY.max_delay_ms,
            retry_on_status_codes=DEFAULT_RETRY_POLICY.retry_on_status_codes,
            jitter=DEFAULT_RETRY_POLICY.jitter,
        )

    max_attempts = _normalize_max_attempts(override.max_attempts)
    base_delay_ms = _normalize_base_delay_ms(override.base_delay_ms)
    max_delay_candidate = _normalize_max_delay_ms(override.max_delay_ms, base_delay_ms)
    max_delay_ms = max(base_delay_ms, max_delay_candidate)

    return EffectiveRetryPolicy(
        enabled=DEFAULT_RETRY_POLICY.enabled if override.enabled is None else override.enabled,
        max_attempts=max_attempts,
        base_delay_ms=base_delay_ms,
        max_delay_ms=max_delay_ms,
        retry_on_status_codes=_normalize_status_codes(override.retry_on_status_codes),
        jitter=DEFAULT_RETRY_POLICY.jitter,
    )


def is_retryable_http_status(
    status_code: int,
    retry_on_status_codes: tuple[int, ...] = (),
) -> bool:
    """Return true when an HTTP status code should be retried."""

    if status_code in DEFAULT_RETRYABLE_STATUS_CODES or status_code >= 500:
        return True

    return status_code in retry_on_status_codes


def is_retryable_error(error: Exception) -> bool:
    """Return true when an SDK error should be retried."""

    if isinstance(error, EdgeSdkError):
        return bool(error.retryable)

    return False


def calculate_backoff_delay_ms(
    retry_attempt: int,
    policy: EffectiveRetryPolicy,
    random: Callable[[], float] | None = None,
) -> int:
    """Calculate bounded exponential backoff delay for a retry attempt."""

    exponential_delay = policy.base_delay_ms * (2 ** max(0, retry_attempt - 1))
    capped_delay = int(min(policy.max_delay_ms, exponential_delay))

    if capped_delay <= 0:
        return 0

    if not policy.jitter:
        return capped_delay

    jitter_factor = random() if random is not None else float(random_module.random())
    return int(jitter_factor * capped_delay)


def serialize_effective_retry_policy(policy: EffectiveRetryPolicy) -> str:
    """Serialize the effective retry policy into a stable cache key."""

    return json.dumps(
        {
            "enabled": policy.enabled,
            "maxAttempts": policy.max_attempts,
            "baseDelayMs": policy.base_delay_ms,
            "maxDelayMs": policy.max_delay_ms,
            "jitter": policy.jitter,
            "retryOnStatusCodes": list(policy.retry_on_status_codes) or None,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def _normalize_max_attempts(value: int | None) -> int:
    if value is None:
        return DEFAULT_RETRY_POLICY.max_attempts
    if _is_invalid_numeric(value):
        return 1

    return max(1, int(value))


def _normalize_base_delay_ms(value: int | None) -> int:
    if value is None:
        return DEFAULT_RETRY_POLICY.base_delay_ms
    if _is_invalid_numeric(value):
        return 0

    return max(0, int(value))


def _normalize_max_delay_ms(value: int | None, base_delay_ms: int) -> int:
    if value is None:
        return DEFAULT_RETRY_POLICY.max_delay_ms
    if _is_invalid_numeric(value):
        return base_delay_ms

    return max(0, int(value))


def _is_invalid_numeric(value: object) -> bool:
    return (
        value is None
        or isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    )


def _normalize_status_codes(status_codes: tuple[int, ...] | None) -> tuple[int, ...]:
    if status_codes is None:
        return DEFAULT_RETRY_POLICY.retry_on_status_codes

    normalized = sorted({int(code) for code in status_codes})
    return tuple(normalized)
