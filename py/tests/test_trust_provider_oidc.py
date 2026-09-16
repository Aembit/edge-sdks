# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest

from aembit_edge.errors import TrustProviderError
from aembit_edge.trust_providers import (
    GitHubTrustProvider,
    GitLabTrustProvider,
    TerraformTrustProvider,
    TrustProvider,
)


def test_github_provider_initialization_and_protocol() -> None:
    """GitHubTrustProvider should initialize and conform to TrustProvider protocol."""
    provider = GitHubTrustProvider(identity_token="dummy-github-token")
    assert isinstance(provider, TrustProvider)
    assert provider.id == "github"
    assert provider.kind == "github"
    assert provider.identity_token == "dummy-github-token"


def test_github_provider_custom_id() -> None:
    """GitHubTrustProvider should preserve a non-blank custom id, or fallback to default."""
    # Preserves trimmed custom ID
    provider_custom = GitHubTrustProvider(identity_token="token", id=" custom-github ")
    assert provider_custom.id == "custom-github"

    # Falls back to default if id is empty
    provider_empty = GitHubTrustProvider(identity_token="token", id="")
    assert provider_empty.id == "github"

    # Blank/whitespace falls back to the default after normalization

    provider_whitespace = GitHubTrustProvider(identity_token="token", id="   ")
    assert provider_whitespace.id == "github"


def test_github_provider_collect_identity_success() -> None:
    """GitHubTrustProvider should return correct identity payload."""
    provider = GitHubTrustProvider(identity_token="my-token")
    identity = provider.collect_identity()
    assert identity.auth_cache_key is None
    assert identity.client == {"github": {"identityToken": "my-token"}}

    # Whitespace-only tokens should be rejected

    provider_whitespace = GitHubTrustProvider(identity_token="   ")
    with pytest.raises(TrustProviderError):
        provider_whitespace.collect_identity()


def test_github_provider_collect_identity_raises_for_empty_token() -> None:
    """GitHubTrustProvider collect_identity should raise TrustProviderError for empty token."""
    provider = GitHubTrustProvider(identity_token="")
    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()
    assert exc_info.value.retryable is False
    assert "GitHub Trust Provider requires a non-empty identity token" in str(exc_info.value)


def test_terraform_provider_initialization_and_protocol() -> None:
    """TerraformTrustProvider should initialize and conform to TrustProvider protocol."""
    provider = TerraformTrustProvider(identity_token="dummy-terraform-token")
    assert isinstance(provider, TrustProvider)
    assert provider.id == "terraform"
    assert provider.kind == "terraform"
    assert provider.identity_token == "dummy-terraform-token"


def test_terraform_provider_custom_id() -> None:
    """TerraformTrustProvider should preserve a non-blank custom id, or fallback to default."""
    # Preserves trimmed custom ID
    provider_custom = TerraformTrustProvider(identity_token="token", id=" custom-terraform ")
    assert provider_custom.id == "custom-terraform"

    # Falls back to default if id is empty
    provider_empty = TerraformTrustProvider(identity_token="token", id="")
    assert provider_empty.id == "terraform"

    # Blank/whitespace falls back to the default after normalization
    provider_whitespace = TerraformTrustProvider(identity_token="token", id="   ")
    assert provider_whitespace.id == "terraform"


def test_terraform_provider_collect_identity_success() -> None:
    """TerraformTrustProvider should return correct identity payload."""
    provider = TerraformTrustProvider(identity_token="my-token")
    identity = provider.collect_identity()
    assert identity.auth_cache_key is None
    assert identity.client == {"terraform": {"identityToken": "my-token"}}

    # Whitespace-only tokens should be rejected
    provider_whitespace = TerraformTrustProvider(identity_token="   ")
    with pytest.raises(TrustProviderError):
        provider_whitespace.collect_identity()


def test_terraform_provider_collect_identity_raises_for_empty_token() -> None:
    """TerraformTrustProvider collect_identity should raise TrustProviderError for empty token."""
    provider = TerraformTrustProvider(identity_token="")
    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()
    assert exc_info.value.retryable is False
    assert "Terraform Trust Provider requires a non-empty identity token" in str(exc_info.value)


def test_gitlab_provider_initialization_and_protocol() -> None:
    """GitLabTrustProvider should initialize and conform to TrustProvider protocol."""
    provider = GitLabTrustProvider(identity_token="dummy-gitlab-token")
    assert isinstance(provider, TrustProvider)
    assert provider.id == "gitlab"
    assert provider.kind == "gitlab"
    assert provider.identity_token == "dummy-gitlab-token"


def test_gitlab_provider_custom_id() -> None:
    """GitLabTrustProvider should preserve a non-blank custom id, or fallback to default."""
    # Preserves trimmed custom ID
    provider_custom = GitLabTrustProvider(identity_token="token", id=" custom-gitlab ")
    assert provider_custom.id == "custom-gitlab"

    # Falls back to default if id is empty
    provider_empty = GitLabTrustProvider(identity_token="token", id="")
    assert provider_empty.id == "gitlab"

    # Blank/whitespace falls back to the default after normalization
    provider_whitespace = GitLabTrustProvider(identity_token="token", id="   ")
    assert provider_whitespace.id == "gitlab"


def test_gitlab_provider_collect_identity_success() -> None:
    """GitLabTrustProvider should return correct identity payload."""
    provider = GitLabTrustProvider(identity_token="my-token")
    identity = provider.collect_identity()
    assert identity.auth_cache_key is None
    assert identity.client == {"gitlab": {"identityToken": "my-token"}}

    # Whitespace-only tokens should be rejected
    provider_whitespace = GitLabTrustProvider(identity_token="   ")
    with pytest.raises(TrustProviderError):
        provider_whitespace.collect_identity()


def test_gitlab_provider_collect_identity_raises_for_empty_token() -> None:
    """GitLabTrustProvider collect_identity should raise TrustProviderError for empty token."""
    provider = GitLabTrustProvider(identity_token="")
    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()
    assert exc_info.value.retryable is False
    assert "GitLab Trust Provider requires a non-empty identity token" in str(exc_info.value)


def test_oidc_providers_with_callable() -> None:
    """OIDC-based providers (GitHub, Terraform, GitLab) should support callable identity tokens."""
    def get_token() -> str:
        return "dynamic-token"

    github = GitHubTrustProvider(identity_token=get_token)
    assert github.get_identity_single_flight_key() is None
    assert github.collect_identity().client == {"github": {"identityToken": "dynamic-token"}}

    terraform = TerraformTrustProvider(identity_token=get_token)
    assert terraform.get_identity_single_flight_key() is None
    assert terraform.collect_identity().client == {"terraform": {"identityToken": "dynamic-token"}}

    gitlab = GitLabTrustProvider(identity_token=get_token)
    assert gitlab.get_identity_single_flight_key() is None
    assert gitlab.collect_identity().client == {"gitlab": {"identityToken": "dynamic-token"}}


def test_oidc_providers_with_callable_error() -> None:
    """OIDC-based providers should raise TrustProviderError if callable raises or returns empty."""
    def raising_callable() -> str:
        raise ValueError("fetch failed")

    def empty_callable() -> str:
        return "   "

    for provider_cls, _name in [
        (GitHubTrustProvider, "GitHub"),
        (TerraformTrustProvider, "Terraform"),
        (GitLabTrustProvider, "GitLab"),
    ]:
        p_raising = provider_cls(identity_token=raising_callable)
        with pytest.raises(TrustProviderError) as exc_info:
            p_raising.collect_identity()
        assert "failed to resolve token from source" in str(exc_info.value)

        p_empty = provider_cls(identity_token=empty_callable)
        with pytest.raises(TrustProviderError) as exc_info:
            p_empty.collect_identity()
        assert "requires a non-empty identity token" in str(exc_info.value)

