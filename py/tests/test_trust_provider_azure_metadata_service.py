# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from unittest.mock import patch

import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.retry import RetryPolicy
from aembit_edge.trust_providers import AzureMetadataServiceTrustProvider


class MockHTTPResponse:
    """Mock urllib.request response context manager."""

    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data

    def __enter__(self) -> MockHTTPResponse:
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        pass


def test_collect_identity_returns_azure_payload() -> None:
    """The provider should return the expected Azure payload when successful."""
    response_data = b'{"encoding": "pkcs7", "signature": "mock-azure-sig-456"}'

    response_mock = MockHTTPResponse(response_data)
    with patch("urllib.request.urlopen", return_value=response_mock) as mock_urlopen:
        provider = AzureMetadataServiceTrustProvider(nonce=lambda: "1234567890")
        identity = provider.collect_identity()

        assert mock_urlopen.call_count == 1
        first_call = mock_urlopen.call_args_list[0]
        first_call_args = first_call[0]
        first_call_kwargs = first_call[1]

        assert first_call_args[0].method == "GET"
        assert "http://169.254.169.254/metadata/attested/document" in first_call_args[0].full_url
        assert first_call_args[0].headers["Metadata"] == "true"
        assert first_call_kwargs["timeout"] == 1.0

        assert identity.auth_cache_key is None
        assert identity.client == {
            "azure": {
                "attestedDocument": {
                    "encoding": "pkcs7",
                    "signature": "mock-azure-sig-456",
                    "nonce": "1234567890",
                }
            }
        }


def test_custom_provider_id_and_base_url() -> None:
    """The provider should honor custom ID, base URL, and api version with whitespace trimming."""
    provider = AzureMetadataServiceTrustProvider(
        id="  custom-azure-id  ",
        base_url="  http://custom-azure.local  ",
        api_version="  2025-01-01  ",
        timeout_ms=500,
    )

    assert provider.id == "custom-azure-id"
    assert provider.base_url == "http://custom-azure.local"
    assert provider.api_version == "2025-01-01"
    assert provider.timeout_ms == 500
    assert provider.get_identity_single_flight_key() == "azure_metadata_service:custom-azure-id"


def test_empty_id_and_base_url_fallback() -> None:
    """The provider should fall back to default values when provided empty values."""
    provider = AzureMetadataServiceTrustProvider(
        id="  ",
        base_url="  ",
        api_version="  ",
        timeout_ms=-10,
    )

    assert provider.id == "azure-metadata-service"
    assert provider.base_url == "http://169.254.169.254"
    assert provider.api_version == "2025-04-07"
    assert provider.timeout_ms == 1000


def test_invalid_nonce_raises_trust_provider_error() -> None:
    """The provider should raise an error if the nonce is not 10 digits."""
    provider = AzureMetadataServiceTrustProvider(nonce=lambda: "12345")
    with pytest.raises(TrustProviderError, match="requires a 10-digit nonce"):
        provider.collect_identity()


def test_request_failure_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when the GET fails."""
    with patch("urllib.request.urlopen", side_effect=Exception("Network error")):
        provider = AzureMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(TrustProviderError, match="attested document request failed"):
            provider.collect_identity()


def test_invalid_json_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when the response JSON is invalid."""
    with patch("urllib.request.urlopen", return_value=MockHTTPResponse(b"invalid-json")):
        provider = AzureMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(TrustProviderError, match="invalid attested document response"):
            provider.collect_identity()


def test_invalid_signature_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when the signature is missing."""
    with patch("urllib.request.urlopen", return_value=MockHTTPResponse(b'{"encoding": "pkcs7"}')):
        provider = AzureMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(TrustProviderError, match="empty attested document signature"):
            provider.collect_identity()


def test_retry_on_failure() -> None:
    """The provider should retry according to the retry policy on failures."""
    responses = [
        Exception("First transient error"),
        MockHTTPResponse(b'{"encoding": "pkcs7", "signature": "mock-azure-sig"}'),
    ]

    sleeps: list[float] = []

    with (
        patch("urllib.request.urlopen", side_effect=responses),
        patch(
            "aembit_edge.internal.retry.calculate_backoff_delay_ms",
            return_value=1200,
        ),
    ):
        provider = AzureMetadataServiceTrustProvider(
            retry=RetryPolicy(max_attempts=3, enabled=True),
            sleep=lambda secs: sleeps.append(secs),
            nonce=lambda: "1234567890",
        )
        identity = provider.collect_identity()

        assert len(sleeps) == 1
        assert sleeps[0] == 1.2
        assert identity.client == {
            "azure": {
                "attestedDocument": {
                    "encoding": "pkcs7",
                    "signature": "mock-azure-sig",
                    "nonce": "1234567890",
                }
            }
        }


def test_map_imds_error_fallback() -> None:
    """The _map_imds_error should map generic Exceptions to retryable TrustProviderError."""
    import aembit_edge.trust_providers.azure_metadata_service as azure_meta

    mapper_field = "_map_imds_error"
    _map_imds_error = getattr(azure_meta, mapper_field)

    raw_error = ValueError("transient-underlying-error")
    mapped = _map_imds_error(raw_error)

    assert isinstance(mapped, TrustProviderError)
    assert mapped.retryable is True
    assert "Azure Instance Metadata Service Trust Provider failed" in str(mapped)
    assert "transient-underlying-error" in str(mapped)
