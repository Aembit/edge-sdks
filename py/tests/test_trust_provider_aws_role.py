# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest
from botocore.exceptions import (
    CredentialRetrievalError,
    NoCredentialsError,
    PartialCredentialsError,
)

from aembit_edge.errors import TrustProviderError
from aembit_edge.internal.trust_providers import AwsRoleSignedRequestData
from aembit_edge.retry import RetryPolicy
from aembit_edge.trust_providers import AwsRoleTrustProvider


def test_collect_identity_returns_sts_get_caller_identity_payload() -> None:
    """The provider should return the expected AWS Role auth payload."""

    calls: list[str] = []

    provider = AwsRoleTrustProvider(
        region=" us-east-1 ",
        signer=lambda region: _capture_signed_request(calls, region),
    )

    identity = provider.collect_identity()

    assert calls == ["us-east-1"]
    assert identity.auth_cache_key is None
    assert identity.client == {
        "aws": {
            "stsGetCallerIdentity": {
                "headers": {
                    "host": "sts.us-east-1.amazonaws.com",
                    "authorization": "AWS4-HMAC-SHA256 Credential=AKID/...",
                },
                "region": "us-east-1",
            }
        }
    }


def test_collect_identity_uses_custom_provider_id() -> None:
    """The provider should preserve a non-blank custom id."""

    provider = AwsRoleTrustProvider(
        id=" custom-aws-role ",
        region="us-east-1",
        signer=lambda region: AwsRoleSignedRequestData(
            headers={"host": f"sts.{region}.amazonaws.com"},
            region=region,
        ),
    )

    assert provider.id == "custom-aws-role"
    assert provider.get_identity_single_flight_key() == "aws_role:custom-aws-role"


def test_collect_identity_rejects_blank_region() -> None:
    """The provider should reject a blank public region option."""

    provider = AwsRoleTrustProvider(
        region="  ",
        signer=lambda region: AwsRoleSignedRequestData(headers={}, region=region),
    )

    with pytest.raises(TrustProviderError, match="requires a non-empty region"):
        provider.collect_identity()


def test_collect_identity_rejects_invalid_header_values() -> None:
    """The provider should reject signer output with non-string header values."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=lambda region: AwsRoleSignedRequestData(
            headers={"host": "sts.us-east-1.amazonaws.com", "x-amz-date": 1},  # type: ignore[dict-item]
            region=region,
        ),
    )

    with pytest.raises(TrustProviderError, match="invalid STS GetCallerIdentity header data"):
        provider.collect_identity()


def test_collect_identity_uses_default_signer_entry_point() -> None:
    """The public surface should keep the signer hook callable."""

    def signer(*, region: str) -> AwsRoleSignedRequestData:
        """Return a minimal signed request payload for the given region."""

        return AwsRoleSignedRequestData(
            headers={"host": f"sts.{region}.amazonaws.com"},
            region=region,
        )

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=signer,
    )

    assert callable(provider.signer)


def test_collect_identity_maps_exhausted_credential_resolution_failures_as_retryable() -> None:
    """Missing credentials should map to a retryable TrustProviderError."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=_raise_no_credentials_error,
    )

    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()

    assert exc_info.value.retryable is True
    assert str(exc_info.value) == "AWS Role Trust Provider could not resolve AWS credentials"


def test_collect_identity_maps_credential_retrieval_failures_as_retryable() -> None:
    """Credential retrieval failures should map to a retryable TrustProviderError."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=_raise_credential_retrieval_error,
    )

    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()

    assert exc_info.value.retryable is True
    assert str(exc_info.value) == "AWS Role Trust Provider could not resolve AWS credentials"


def test_collect_identity_maps_partial_credentials_as_non_retryable() -> None:
    """Partial credentials should map to a non-retryable TrustProviderError."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=_raise_partial_credentials_error,
    )

    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()

    assert exc_info.value.retryable is False
    assert str(exc_info.value) == "AWS Role Trust Provider could not resolve AWS credentials"


def test_collect_identity_maps_deterministic_credential_validation_errors_as_non_retryable() -> (
    None
):
    """Local credential validation failures should not be retried."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=_raise_empty_access_key_error,
    )

    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()

    assert exc_info.value.retryable is False
    assert str(exc_info.value) == "AWS Role Trust Provider could not resolve AWS credentials"


def test_collect_identity_maps_unexpected_signer_failures_as_non_retryable() -> None:
    """Unexpected signer failures should surface as non-retryable SDK errors."""

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=_raise_unexpected_error,
    )

    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()

    assert exc_info.value.retryable is False
    assert (
        str(exc_info.value)
        == "AWS Role Trust Provider failed to build STS GetCallerIdentity request data"
    )


def test_collect_identity_retries_retryable_failures() -> None:
    """Retryable signer failures should be retried by the provider."""

    calls = {"count": 0}

    def signer(*, region: str) -> AwsRoleSignedRequestData:
        """Fail once, then return a valid signed request."""

        calls["count"] += 1
        if calls["count"] == 1:
            raise NoCredentialsError()

        return AwsRoleSignedRequestData(
            headers={"host": f"sts.{region}.amazonaws.com"},
            region=region,
        )

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        retry=RetryPolicy(max_attempts=2, base_delay_ms=0, max_delay_ms=0),
        signer=signer,
    )

    identity = provider.collect_identity()

    assert calls["count"] == 2
    assert identity.client == {
        "aws": {
            "stsGetCallerIdentity": {
                "headers": {"host": "sts.us-east-1.amazonaws.com"},
                "region": "us-east-1",
            }
        }
    }


def test_collect_identity_does_not_retry_non_retryable_failures() -> None:
    """Non-retryable signer failures should stop after the first attempt."""

    calls = {"count": 0}

    def signer(*, region: str) -> AwsRoleSignedRequestData:
        """Always raise a deterministic partial-credentials failure."""

        del region
        calls["count"] += 1
        raise PartialCredentialsError(provider="env", cred_var="AWS_SECRET_ACCESS_KEY")

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        retry=RetryPolicy(max_attempts=3, base_delay_ms=0, max_delay_ms=0),
        signer=signer,
    )

    with pytest.raises(TrustProviderError):
        provider.collect_identity()

    assert calls["count"] == 1


def test_collect_identity_respects_disabled_retry_setting() -> None:
    """Disabled retry settings should force a single provider attempt."""

    calls = {"count": 0}

    def signer(*, region: str) -> AwsRoleSignedRequestData:
        """Always raise a retryable missing-credentials failure."""

        del region
        calls["count"] += 1
        raise NoCredentialsError()

    provider = AwsRoleTrustProvider(
        region="us-east-1",
        retry=RetryPolicy(enabled=False, max_attempts=5, base_delay_ms=0, max_delay_ms=0),
        signer=signer,
    )

    with pytest.raises(TrustProviderError):
        provider.collect_identity()

    assert calls["count"] == 1


def _capture_signed_request(
    calls: list[str],
    region: str,
) -> AwsRoleSignedRequestData:
    """Record the region and return a deterministic signed request payload."""

    calls.append(region)
    return AwsRoleSignedRequestData(
        headers={
            "host": f"sts.{region}.amazonaws.com",
            "authorization": "AWS4-HMAC-SHA256 Credential=AKID/...",
        },
        region=region,
    )


def _raise_no_credentials_error(*, region: str) -> AwsRoleSignedRequestData:
    """Raise the botocore missing-credentials error used by the provider."""

    del region
    raise NoCredentialsError()


def _raise_credential_retrieval_error(*, region: str) -> AwsRoleSignedRequestData:
    """Raise the botocore credential-retrieval error used by the provider."""

    del region
    raise CredentialRetrievalError(provider="iam-role", error_msg="boom")


def _raise_partial_credentials_error(*, region: str) -> AwsRoleSignedRequestData:
    """Raise the botocore partial-credentials error used by the provider."""

    del region
    raise PartialCredentialsError(provider="env", cred_var="AWS_SECRET_ACCESS_KEY")


def _raise_empty_access_key_error(*, region: str) -> AwsRoleSignedRequestData:
    """Raise a deterministic local credential validation failure."""

    del region
    raise ValueError("AWS credential provider returned an empty accessKeyId")


def _raise_unexpected_error(*, region: str) -> AwsRoleSignedRequestData:
    """Raise an unexpected signer failure for generic error mapping tests."""

    del region
    raise RuntimeError("unexpected signer failure")
