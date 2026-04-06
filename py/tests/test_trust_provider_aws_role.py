from __future__ import annotations

import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.internal.trust_providers import AwsRoleSignedRequestData
from aembit_edge.trust_providers import AwsRoleTrustProvider


def test_collect_identity_returns_sts_get_caller_identity_payload() -> None:
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
    provider = AwsRoleTrustProvider(
        region="  ",
        signer=lambda region: AwsRoleSignedRequestData(headers={}, region=region),
    )

    with pytest.raises(TrustProviderError, match="requires a non-empty region"):
        provider.collect_identity()


def test_collect_identity_rejects_invalid_header_values() -> None:
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
    provider = AwsRoleTrustProvider(region="us-east-1")

    with pytest.raises(TrustProviderError, match="signing is not implemented yet"):
        provider.collect_identity()


def _capture_signed_request(
    calls: list[str],
    region: str,
) -> AwsRoleSignedRequestData:
    calls.append(region)
    return AwsRoleSignedRequestData(
        headers={
            "host": f"sts.{region}.amazonaws.com",
            "authorization": "AWS4-HMAC-SHA256 Credential=AKID/...",
        },
        region=region,
    )
