# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.trust_providers import GcpIdentityTokenTrustProvider


def test_collect_identity_static_string() -> None:
    """The provider should collect the GCP token from a static string."""
    provider = GcpIdentityTokenTrustProvider(identity_token="static-gcp-123")

    assert provider.id == "gcp-identity-token"
    assert provider.kind == "gcp_identity_token"
    assert provider.get_identity_single_flight_key() == "gcp_identity_token:gcp-identity-token"

    identity = provider.collect_identity()
    assert identity.client == {"gcp": {"identityToken": "static-gcp-123"}}


def test_collect_identity_custom_id() -> None:
    """The provider should honor custom ID."""
    provider = GcpIdentityTokenTrustProvider(
        id="custom-gcp-id",
        identity_token="static-gcp-123",
    )

    assert provider.id == "custom-gcp-id"
    assert provider.get_identity_single_flight_key() == "gcp_identity_token:custom-gcp-id"


def test_collect_identity_callable() -> None:
    """The provider should resolve the token from a callable."""
    called_count = 0

    def token_source() -> str:
        nonlocal called_count
        called_count += 1
        return "token-from-callable"

    provider = GcpIdentityTokenTrustProvider(identity_token=token_source)

    assert provider.get_identity_single_flight_key() is None

    identity = provider.collect_identity()
    assert identity.client == {"gcp": {"identityToken": "token-from-callable"}}
    assert called_count == 1


def test_empty_token_raises_error() -> None:
    """The provider should raise TrustProviderError when the token is empty."""
    provider = GcpIdentityTokenTrustProvider(identity_token="   ")
    with pytest.raises(TrustProviderError, match="requires a non-empty identity token") as exc:
        provider.collect_identity()
    assert exc.value.retryable is False


def test_callable_failure_raises_error() -> None:
    """The provider should raise TrustProviderError when the callable fails."""

    def failing_source() -> str:
        raise ValueError("Network timeout")

    provider = GcpIdentityTokenTrustProvider(identity_token=failing_source)
    with pytest.raises(TrustProviderError, match="failed to resolve token from source") as exc:
        provider.collect_identity()
    assert exc.value.retryable is False
