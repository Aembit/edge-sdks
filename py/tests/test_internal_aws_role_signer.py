from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

import pytest

from aembit_edge.internal.trust_providers import (
    AwsCredentialIdentity,
    build_aws_sts_get_caller_identity_signed_data,
)


def test_builds_signed_sts_headers_for_get_caller_identity() -> None:
    result = build_aws_sts_get_caller_identity_signed_data(
        region="us-east-1",
        credentials_provider=lambda: AwsCredentialIdentity(
            access_key_id="AKIDEXAMPLE",
            secret_access_key="wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            session_token="session-token-1",
        ),
        now=lambda: datetime(2026, 3, 12, 10, 15, 30, tzinfo=timezone.utc),
    )

    assert result.region == "us-east-1"
    assert result.headers["host"] == "sts.us-east-1.amazonaws.com"
    assert result.headers["content-type"] == "application/x-www-form-urlencoded; charset=utf-8"
    assert result.headers["x-amz-date"] == "20260312T101530Z"
    assert result.headers["x-amz-security-token"] == "session-token-1"
    authorization = cast(str, result.headers["authorization"])
    assert "AWS4-HMAC-SHA256" in authorization
    assert "Credential=AKIDEXAMPLE/20260312/us-east-1/sts/aws4_request" in authorization


def test_uses_partition_aware_sts_host_for_aws_china_regions() -> None:
    result = build_aws_sts_get_caller_identity_signed_data(
        region="cn-north-1",
        credentials_provider=lambda: AwsCredentialIdentity(
            access_key_id="AKIDEXAMPLE",
            secret_access_key="secret",
        ),
        now=lambda: datetime(2026, 3, 12, 10, 15, 30, tzinfo=timezone.utc),
    )

    assert result.headers["host"] == "sts.cn-north-1.amazonaws.com.cn"
    authorization = cast(str, result.headers["authorization"])
    assert "Credential=AKIDEXAMPLE/20260312/cn-north-1/sts/aws4_request" in authorization


def test_keeps_standard_sts_host_format_for_govcloud_regions() -> None:
    result = build_aws_sts_get_caller_identity_signed_data(
        region="us-gov-west-1",
        credentials_provider=lambda: AwsCredentialIdentity(
            access_key_id="AKIDEXAMPLE",
            secret_access_key="secret",
        ),
        now=lambda: datetime(2026, 3, 12, 10, 15, 30, tzinfo=timezone.utc),
    )

    assert result.headers["host"] == "sts.us-gov-west-1.amazonaws.com"
    authorization = cast(str, result.headers["authorization"])
    assert "Credential=AKIDEXAMPLE/20260312/us-gov-west-1/sts/aws4_request" in authorization


def test_omits_security_token_when_session_token_is_not_present() -> None:
    result = build_aws_sts_get_caller_identity_signed_data(
        region="us-west-2",
        credentials_provider=lambda: AwsCredentialIdentity(
            access_key_id="AKIDEXAMPLE",
            secret_access_key="secret",
        ),
        now=lambda: datetime(2026, 3, 12, 10, 15, 30, tzinfo=timezone.utc),
    )

    assert "x-amz-security-token" not in result.headers
    authorization = cast(str, result.headers["authorization"])
    assert "Credential=AKIDEXAMPLE/20260312/us-west-2/sts/aws4_request" in authorization


def test_trims_and_validates_region() -> None:
    result = build_aws_sts_get_caller_identity_signed_data(
        region=" eu-central-1 ",
        credentials_provider=lambda: AwsCredentialIdentity(
            access_key_id="AKIDEXAMPLE",
            secret_access_key="secret",
        ),
        now=lambda: datetime(2026, 3, 12, 10, 15, 30),
    )

    assert result.region == "eu-central-1"

    with pytest.raises(ValueError, match="requires a non-empty region"):
        build_aws_sts_get_caller_identity_signed_data(
            region="  ",
            credentials_provider=lambda: AwsCredentialIdentity(
                access_key_id="AKIDEXAMPLE",
                secret_access_key="secret",
            ),
        )


def test_fails_when_credential_provider_returns_missing_key_fields() -> None:
    with pytest.raises(ValueError, match="empty accessKeyId"):
        build_aws_sts_get_caller_identity_signed_data(
            region="us-east-1",
            credentials_provider=lambda: AwsCredentialIdentity(
                access_key_id=" ",
                secret_access_key="secret",
            ),
        )

    with pytest.raises(ValueError, match="empty secretAccessKey"):
        build_aws_sts_get_caller_identity_signed_data(
            region="us-east-1",
            credentials_provider=lambda: AwsCredentialIdentity(
                access_key_id="AKIDEXAMPLE",
                secret_access_key=" ",
            ),
        )
