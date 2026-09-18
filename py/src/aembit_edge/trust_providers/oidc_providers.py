# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""OIDC-based Trust Providers for CI/CD platforms."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import ClassVar

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

    identity_token: str | Callable[[], str]
    id: str = DEFAULT_GITHUB_ID

    kind: ClassVar[TrustProviderKind] = "github"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        normalized_id = self.id.strip() if self.id else ""
        self.id = normalized_id or DEFAULT_GITHUB_ID

    def get_identity_single_flight_key(self) -> str | None:
        """Only static token strings are safe to de-duplicate."""
        return f"{self.kind}:{self.id}" if isinstance(self.identity_token, str) else None

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the GitHub identity token for `/edge/v1/auth`."""
        from ..errors import TrustProviderError

        if callable(self.identity_token):
            try:
                token = self.identity_token()
            except TrustProviderError:
                raise
            except Exception as e:
                raise TrustProviderError(
                    f"GitHub Trust Provider failed to resolve token from source: {e}",
                    retryable=False,
                ) from e
        else:
            token = self.identity_token

        token_clean = token.strip() if token else ""
        if not token_clean:
            raise TrustProviderError(
                "GitHub Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(client={"github": {"identityToken": token_clean}})


@dataclass(slots=True)
class TerraformTrustProvider:
    """Built-in Terraform Cloud Trust Provider.

    This provider collects the `client.terraform.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str | Callable[[], str]
    id: str = DEFAULT_TERRAFORM_ID

    kind: ClassVar[TrustProviderKind] = "terraform"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        normalized_id = self.id.strip() if self.id else ""
        self.id = normalized_id or DEFAULT_TERRAFORM_ID

    def get_identity_single_flight_key(self) -> str | None:
        """Only static token strings are safe to de-duplicate."""
        return f"{self.kind}:{self.id}" if isinstance(self.identity_token, str) else None

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the Terraform identity token for `/edge/v1/auth`."""
        from ..errors import TrustProviderError

        if callable(self.identity_token):
            try:
                token = self.identity_token()
            except TrustProviderError:
                raise
            except Exception as e:
                raise TrustProviderError(
                    f"Terraform Trust Provider failed to resolve token from source: {e}",
                    retryable=False,
                ) from e
        else:
            token = self.identity_token

        token_clean = token.strip() if token else ""
        if not token_clean:
            raise TrustProviderError(
                "Terraform Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(client={"terraform": {"identityToken": token_clean}})


@dataclass(slots=True)
class GitLabTrustProvider:
    """Built-in GitLab Job Trust Provider.

    This provider collects the `client.gitlab.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str | Callable[[], str]
    id: str = DEFAULT_GITLAB_ID

    kind: ClassVar[TrustProviderKind] = "gitlab"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        normalized_id = self.id.strip() if self.id else ""
        self.id = normalized_id or DEFAULT_GITLAB_ID

    def get_identity_single_flight_key(self) -> str | None:
        """Only static token strings are safe to de-duplicate."""
        return f"{self.kind}:{self.id}" if isinstance(self.identity_token, str) else None

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the GitLab identity token for `/edge/v1/auth`."""
        from ..errors import TrustProviderError

        if callable(self.identity_token):
            try:
                token = self.identity_token()
            except TrustProviderError:
                raise
            except Exception as e:
                raise TrustProviderError(
                    f"GitLab Trust Provider failed to resolve token from source: {e}",
                    retryable=False,
                ) from e
        else:
            token = self.identity_token

        token_clean = token.strip() if token else ""
        if not token_clean:
            raise TrustProviderError(
                "GitLab Trust Provider requires a non-empty identity token",
                retryable=False,
            )
        return CollectedTrustProviderIdentity(client={"gitlab": {"identityToken": token_clean}})
