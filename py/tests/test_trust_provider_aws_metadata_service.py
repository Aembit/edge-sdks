# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import base64
from unittest.mock import patch

import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.retry import RetryPolicy
from aembit_edge.trust_providers import AwsMetadataServiceTrustProvider


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


def test_collect_identity_returns_metadata_payload() -> None:
    """The provider should return the expected IMDSv2 payload when successful."""

    token_data = b"mock-token-123"
    doc_data = b'{"instanceId": "i-1234567890abcdef0", "region": "us-east-1"}'
    sig_data = b"mock-signature-456"

    responses = [
        MockHTTPResponse(token_data),
        MockHTTPResponse(doc_data),
        MockHTTPResponse(sig_data),
    ]

    with patch("urllib.request.urlopen", side_effect=responses) as mock_urlopen:
        provider = AwsMetadataServiceTrustProvider()
        identity = provider.collect_identity()

        assert mock_urlopen.call_count == 3
        # Check first call (Token PUT)
        first_call_args = mock_urlopen.call_args_list[0][0]
        assert first_call_args[0].method == "PUT"
        assert first_call_args[0].full_url == "http://169.254.169.254/latest/api/token"

        # Check second call (Document GET)
        second_call_args = mock_urlopen.call_args_list[1][0]
        assert second_call_args[0].method == "GET"
        assert second_call_args[0].full_url == "http://169.254.169.254/latest/dynamic/instance-identity/document"
        assert second_call_args[0].headers["X-aws-ec2-metadata-token"] == "mock-token-123"

        # Check identity structure
        assert identity.auth_cache_key is None
        expected_b64_doc = base64.b64encode(doc_data).decode("utf-8")
        assert identity.client == {
            "aws": {
                "instanceIdentityDocument": expected_b64_doc,
                "instanceIdentityDocumentSignature": "mock-signature-456",
            }
        }


def test_custom_provider_id_and_base_url() -> None:
    """The provider should honor custom ID and base URL."""

    provider = AwsMetadataServiceTrustProvider(
        id="custom-id",
        base_url="http://custom.local",
        timeout_ms=500,
        token_ttl_seconds=60,
    )

    assert provider.id == "custom-id"
    assert provider.base_url == "http://custom.local"
    assert provider.timeout_ms == 500
    assert provider.token_ttl_seconds == 60
    assert provider.get_identity_single_flight_key() == "aws_metadata_service:custom-id"


def test_empty_id_and_base_url_fallback() -> None:
    """The provider should fall back to default values when provided empty values."""

    provider = AwsMetadataServiceTrustProvider(
        id="  ",
        base_url="  ",
        timeout_ms=-10,
        token_ttl_seconds=-10,
    )

    assert provider.id == "aws-metadata-service"
    assert provider.base_url == "http://169.254.169.254"
    assert provider.timeout_ms == 1000
    assert provider.token_ttl_seconds == 2160


def test_token_fetch_failure_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when the token cannot be fetched."""

    with patch("urllib.request.urlopen", side_effect=Exception("Network error")):
        provider = AwsMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(TrustProviderError, match="Failed to fetch IMDSv2 token"):
            provider.collect_identity()


def test_empty_token_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when the returned token is empty."""

    with patch("urllib.request.urlopen", return_value=MockHTTPResponse(b"")):
        provider = AwsMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(TrustProviderError, match="IMDSv2 token response was empty"):
            provider.collect_identity()


def test_document_fetch_failure_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when document GET fails."""

    responses = [
        MockHTTPResponse(b"mock-token"),
        Exception("Document error"),
    ]

    with patch("urllib.request.urlopen", side_effect=responses):
        provider = AwsMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(
            TrustProviderError, match="Failed to fetch instance identity document"
        ):
            provider.collect_identity()


def test_signature_fetch_failure_raises_trust_provider_error() -> None:
    """The provider should raise a TrustProviderError when signature GET fails."""

    responses = [
        MockHTTPResponse(b"mock-token"),
        MockHTTPResponse(b"document-content"),
        Exception("Signature error"),
    ]

    with patch("urllib.request.urlopen", side_effect=responses):
        provider = AwsMetadataServiceTrustProvider(retry=RetryPolicy(enabled=False))
        with pytest.raises(
            TrustProviderError, match="Failed to fetch instance identity document signature"
        ):
            provider.collect_identity()


def test_imds_provider_retries_on_failure() -> None:
    """The provider should retry according to the retry policy on failures."""

    responses = [
        Exception("First transient error"),
        MockHTTPResponse(b"mock-token"),
        MockHTTPResponse(b"document-content"),
        MockHTTPResponse(b"mock-signature"),
    ]

    sleeps: list[float] = []

    with patch("urllib.request.urlopen", side_effect=responses):
        provider = AwsMetadataServiceTrustProvider(
            retry=RetryPolicy(max_attempts=3, enabled=True),
            sleep=lambda secs: sleeps.append(secs),
        )
        identity = provider.collect_identity()

        assert len(sleeps) == 1
        assert sleeps[0] > 0
        expected_b64_doc = base64.b64encode(b"document-content").decode("utf-8")
        assert identity.client == {
            "aws": {
                "instanceIdentityDocument": expected_b64_doc,
                "instanceIdentityDocumentSignature": "mock-signature",
            }
        }
