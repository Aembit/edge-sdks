"""Public retry configuration types."""

from dataclasses import dataclass


@dataclass(slots=True, kw_only=True)
class RetryPolicy:
    """Retry policy override for transport requests."""

    enabled: bool | None = None
    max_attempts: int | None = None
    base_delay_ms: int | None = None
    max_delay_ms: int | None = None
    retry_on_status_codes: tuple[int, ...] | None = None
