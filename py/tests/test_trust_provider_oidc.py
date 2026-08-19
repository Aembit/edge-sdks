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

    # Blank/whitespace becomes empty string because of strip() in post_init
    provider_whitespace = TerraformTrustProvider(identity_token="token", id="   ")
    assert provider_whitespace.id == ""


def test_terraform_provider_collect_identity_success() -> None:
    """TerraformTrustProvider should return correct identity payload."""
    provider = TerraformTrustProvider(identity_token="my-token")
    identity = provider.collect_identity()
    assert identity.auth_cache_key is None
    assert identity.client == {"terraform": {"identityToken": "my-token"}}

    # Whitespace token is accepted as-is by collect_identity because it's non-empty
    provider_whitespace = TerraformTrustProvider(identity_token="   ")
    identity_whitespace = provider_whitespace.collect_identity()
    assert identity_whitespace.client == {"terraform": {"identityToken": "   "}}


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

    # Blank/whitespace becomes empty string because of strip() in post_init
    provider_whitespace = GitLabTrustProvider(identity_token="token", id="   ")
    assert provider_whitespace.id == ""


def test_gitlab_provider_collect_identity_success() -> None:
    """GitLabTrustProvider should return correct identity payload."""
    provider = GitLabTrustProvider(identity_token="my-token")
    identity = provider.collect_identity()
    assert identity.auth_cache_key is None
    assert identity.client == {"gitlab": {"identityToken": "my-token"}}

    # Whitespace token is accepted as-is by collect_identity because it's non-empty
    provider_whitespace = GitLabTrustProvider(identity_token="   ")
    identity_whitespace = provider_whitespace.collect_identity()
    assert identity_whitespace.client == {"gitlab": {"identityToken": "   "}}


def test_gitlab_provider_collect_identity_raises_for_empty_token() -> None:
    """GitLabTrustProvider collect_identity should raise TrustProviderError for empty token."""
    provider = GitLabTrustProvider(identity_token="")
    with pytest.raises(TrustProviderError) as exc_info:
        provider.collect_identity()
    assert exc_info.value.retryable is False
    assert "GitLab Trust Provider requires a non-empty identity token" in str(exc_info.value)
