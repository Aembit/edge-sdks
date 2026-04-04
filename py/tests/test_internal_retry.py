from aembit_edge.internal.protocol.retry import (
    calculate_backoff_delay_ms,
    is_retryable_http_status,
    merge_retry_overrides,
    merge_retry_policy,
)
from aembit_edge.retry import RetryPolicy


def test_merge_retry_overrides_preserves_base_when_request_fields_are_unset() -> None:
    merged = merge_retry_overrides(
        RetryPolicy(max_attempts=5, retry_on_status_codes=(409,)),
        RetryPolicy(enabled=False),
    )

    assert merged == RetryPolicy(enabled=False, max_attempts=5, retry_on_status_codes=(409,))


def test_merge_retry_overrides_allows_explicit_empty_status_code_override() -> None:
    merged = merge_retry_overrides(
        RetryPolicy(retry_on_status_codes=(409,)),
        RetryPolicy(retry_on_status_codes=()),
    )

    assert merged is not None
    assert merged.retry_on_status_codes == ()


def test_merge_retry_policy_normalizes_values() -> None:
    policy = merge_retry_policy(RetryPolicy(max_attempts=0, base_delay_ms=-1, max_delay_ms=1))

    assert policy.max_attempts == 1
    assert policy.base_delay_ms == 0
    assert policy.max_delay_ms == 1


def test_merge_retry_policy_ignores_non_finite_numeric_values() -> None:
    policy = merge_retry_policy(
        RetryPolicy(
            max_attempts=float("nan"),  # type: ignore[arg-type]
            base_delay_ms=float("inf"),  # type: ignore[arg-type]
            max_delay_ms=float("nan"),  # type: ignore[arg-type]
        )
    )

    assert policy.max_attempts == 1
    assert policy.base_delay_ms == 0
    assert policy.max_delay_ms == 0


def test_merge_retry_policy_returns_fresh_default_instances() -> None:
    first = merge_retry_policy()
    second = merge_retry_policy()

    assert first is not second


def test_is_retryable_http_status_uses_defaults_and_custom_codes() -> None:
    assert is_retryable_http_status(500) is True
    assert is_retryable_http_status(429) is True
    assert is_retryable_http_status(409, (409,)) is True
    assert is_retryable_http_status(400) is False


def test_calculate_backoff_delay_ms_uses_bounded_jitter() -> None:
    policy = merge_retry_policy(RetryPolicy(base_delay_ms=200, max_delay_ms=2000))

    assert calculate_backoff_delay_ms(2, policy, random=lambda: 0.5) == 200
