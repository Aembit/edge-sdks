"""OIDC-based Trust Providers for CI/CD platforms."""

from __future__ import annotations

from dataclasses import dataclass
from .base import CollectedTrustProviderIdentity, TrustProviderKind

DEFAULT_GITHUB_ID = "github"
DEFAULT_TERRAFORM_ID = "terraform"
DEFAULT_GITLAB_ID = "gitlab"


@dataclass(slots=True)
class GitHubTrustProvider:
    """Built-in GitHub Action Trust Provider.

    This provider collects the `client.github.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str
    id: str = DEFAULT_GITHUB_ID

    kind: TrustProviderKind = "github"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        self.id = self.id.strip() if self.id else DEFAULT_GITHUB_ID

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the GitHub identity token for `/edge/v1/auth`."""
        if not self.identity_token:
            from ..errors import TrustProviderError
            raise TrustProviderError(
                "GitHub Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(
            client={
                "github": {
                    "identityToken": self.identity_token
                }
            }
        )


@dataclass(slots=True)
class TerraformTrustProvider:
    """Built-in Terraform Cloud Trust Provider.

    This provider collects the `client.terraform.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str
    id: str = DEFAULT_TERRAFORM_ID

    kind: TrustProviderKind = "terraform"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        self.id = self.id.strip() if self.id else DEFAULT_TERRAFORM_ID

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the Terraform identity token for `/edge/v1/auth`."""
        if not self.identity_token:
            from ..errors import TrustProviderError
            raise TrustProviderError(
                "Terraform Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(
            client={
                "terraform": {
                    "identityToken": self.identity_token
                }
            }
        )


@dataclass(slots=True)
class GitLabTrustProvider:
    """Built-in GitLab Job Trust Provider.

    This provider collects the `client.gitlab.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str
    id: str = DEFAULT_GITLAB_ID

    kind: TrustProviderKind = "gitlab"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        self.id = self.id.strip() if self.id else DEFAULT_GITLAB_ID

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the GitLab identity token for `/edge/v1/auth`."""
        if not self.identity_token:
            from ..errors import TrustProviderError
            raise TrustProviderError(
                "GitLab Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(
            client={
                "gitlab": {
                    "identityToken": self.identity_token
                }
            }
        )
