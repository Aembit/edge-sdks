from aembit_edge.internal.client.token_state import (
    CachedTokenState,
    format_expires_at,
    is_token_valid,
    resolve_auth_expiry_skew_ms,
    resolve_effective_resource_set,
    serialize_auth_single_flight_key,
    serialize_effective_retry_policy_key,
)
from aembit_edge.retry import RetryPolicy


def test_resolve_auth_expiry_skew_ms_defaults_to_sixty_seconds() -> None:
    assert resolve_auth_expiry_skew_ms(None) == 60_000


def test_resolve_auth_expiry_skew_ms_falls_back_on_negative_values() -> None:
    assert resolve_auth_expiry_skew_ms(-1) == 60_000
    assert resolve_auth_expiry_skew_ms(-0.5) == 60_000


def test_resolve_auth_expiry_skew_ms_falls_back_on_non_finite_values() -> None:
    assert resolve_auth_expiry_skew_ms(float("nan")) == 60_000
    assert resolve_auth_expiry_skew_ms(float("inf")) == 60_000


def test_is_token_valid_accepts_non_expiring_tokens() -> None:
    assert is_token_valid(
        CachedTokenState(access_token="token-1", expires_at_ms=None),
        now_ms=1_000,
        skew_ms=60_000,
    )


def test_is_token_valid_applies_skew_window() -> None:
    assert not is_token_valid(
        CachedTokenState(access_token="token-1", expires_at_ms=10_000),
        now_ms=9_500,
        skew_ms=1_000,
    )


def test_format_expires_at_formats_utc_timestamp() -> None:
    assert format_expires_at(0) == "1970-01-01T00:00:00.000Z"


def test_resolve_effective_resource_set_prefers_request_override() -> None:
    assert resolve_effective_resource_set("default", "request") == "request"


def test_serialize_auth_single_flight_key_is_stable() -> None:
    assert (
        serialize_auth_single_flight_key(
            resource_set="rs-1",
            auth_cache_key="provider-1",
            retry_key="retry-1",
        )
        == '["rs-1","provider-1","retry-1"]'
    )


def test_serialize_effective_retry_policy_key_is_stable() -> None:
    expected_key = (
        '{"baseDelayMs":0,"enabled":false,"jitter":true,"maxAttempts":1,'
        '"maxDelayMs":0,"retryOnStatusCodes":null}'
    )
    assert (
        serialize_effective_retry_policy_key(
            base_retry=RetryPolicy(max_attempts=5),
            request_retry=RetryPolicy(enabled=False),
        )
        == expected_key
    )
