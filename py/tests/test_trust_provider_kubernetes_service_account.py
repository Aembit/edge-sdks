# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from unittest.mock import mock_open, patch

import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.trust_providers import KubernetesServiceAccountTrustProvider


def test_collect_identity_static_string() -> None:
    """The provider should collect the token from a static string."""
    provider = KubernetesServiceAccountTrustProvider(token="static-k8s-123")

    assert provider.id == "kubernetes-service-account"
    assert provider.kind == "kubernetes_service_account"
    assert provider.token_path == "/var/run/secrets/kubernetes.io/serviceaccount/token"

    expected_key = "kubernetes_service_account:kubernetes-service-account"
    assert provider.get_identity_single_flight_key() == expected_key

    identity = provider.collect_identity()
    assert identity.client == {"k8s": {"serviceAccountToken": "static-k8s-123"}}


def test_collect_identity_custom_id_and_path() -> None:
    """The provider should honor custom ID and custom token path."""
    provider = KubernetesServiceAccountTrustProvider(
        id="custom-k8s-id",
        token_path="/tmp/my-token-path",
        token="static-k8s-123",
    )

    assert provider.id == "custom-k8s-id"
    assert provider.token_path == "/tmp/my-token-path"
    assert provider.get_identity_single_flight_key() == "kubernetes_service_account:custom-k8s-id"


def test_collect_identity_callable() -> None:
    """The provider should resolve the token from a callable."""
    called_count = 0

    def token_source() -> str:
        nonlocal called_count
        called_count += 1
        return "token-from-callable"

    provider = KubernetesServiceAccountTrustProvider(token=token_source)

    assert provider.get_identity_single_flight_key() is None

    identity = provider.collect_identity()
    assert identity.client == {"k8s": {"serviceAccountToken": "token-from-callable"}}
    assert called_count == 1


def test_callable_failure_raises_error() -> None:
    """The provider should raise TrustProviderError when the callable fails."""

    def failing_source() -> str:
        raise ValueError("Simulated callable failure")

    provider = KubernetesServiceAccountTrustProvider(token=failing_source)
    with pytest.raises(TrustProviderError, match="failed to resolve token from source") as exc:
        provider.collect_identity()
    assert exc.value.retryable is False


def test_collect_identity_from_file_success() -> None:
    """The provider should read the token from disk when no override is supplied."""
    provider = KubernetesServiceAccountTrustProvider(token_path="/mock/token/path")

    assert provider.get_identity_single_flight_key() is None

    mock_token_content = "  jwt-token-from-file-content\n"

    with patch("os.path.exists", return_value=True), patch(
        "builtins.open", mock_open(read_data=mock_token_content)
    ) as mock_file:
        identity = provider.collect_identity()
        mock_file.assert_called_once_with("/mock/token/path", encoding="utf-8")
        assert identity.client == {"k8s": {"serviceAccountToken": "jwt-token-from-file-content"}}


def test_collect_identity_from_file_missing_raises_error() -> None:
    """The provider should raise TrustProviderError when the token file does not exist."""
    provider = KubernetesServiceAccountTrustProvider(token_path="/mock/missing/token")

    with patch("os.path.exists", return_value=False):
        with pytest.raises(TrustProviderError, match="token file not found at") as exc:
            provider.collect_identity()
        assert exc.value.retryable is False


def test_collect_identity_from_file_read_failure_raises_error() -> None:
    """The provider should raise TrustProviderError when reading the token file fails."""
    provider = KubernetesServiceAccountTrustProvider(token_path="/mock/unreadable/token")

    with patch("os.path.exists", return_value=True), patch(
        "builtins.open", side_effect=PermissionError("Permission denied")
    ):
        with pytest.raises(TrustProviderError, match="failed to read token file") as exc:
            provider.collect_identity()
        assert exc.value.retryable is False


def test_empty_token_raises_error() -> None:
    """The provider should raise TrustProviderError when resolved token is empty."""
    # Test empty static override
    provider1 = KubernetesServiceAccountTrustProvider(token="   ")
    err_msg = "requires a non-empty service account token"
    with pytest.raises(TrustProviderError, match=err_msg) as exc:
        provider1.collect_identity()
    assert exc.value.retryable is False

    # Test empty file read
    provider2 = KubernetesServiceAccountTrustProvider(token_path="/mock/empty/token")
    with patch("os.path.exists", return_value=True), patch(
        "builtins.open", mock_open(read_data="   \n")
    ):
        with pytest.raises(TrustProviderError, match=err_msg) as exc:
            provider2.collect_identity()
        assert exc.value.retryable is False
