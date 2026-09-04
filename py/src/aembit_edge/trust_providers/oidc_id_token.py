# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public OIDC ID Token Trust Provider surface."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import ClassVar

from ..errors import TrustProviderError
from .base import CollectedTrustProviderIdentity, TrustProviderKind

DEFAULT_PROVIDER_ID = "oidc-id-token"


@dataclass(slots=True)
class OidcIdTokenTrustProvider:
    """Built-in OIDC ID Token Trust Provider.

    This provider collects the `client.oidc.identityToken` payload content
    for `/edge/v1/auth` requests.
    """

    identity_token: str | Callable[[], str]
    id: str = DEFAULT_PROVIDER_ID

    kind: ClassVar[TrustProviderKind] = "oidc_id_token"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""
        normalized_id = self.id.strip() if self.id else ""
        self.id = normalized_id or DEFAULT_PROVIDER_ID

    def get_identity_single_flight_key(self) -> str | None:
        """Only static token strings are safe to de-duplicate."""
        return f"{self.kind}:{self.id}" if isinstance(self.identity_token, str) else None

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the OIDC identity token for `/edge/v1/auth`."""
        if callable(self.identity_token):
            try:
                token = self.identity_token()
            except Exception as e:
                raise TrustProviderError(
                    f"OIDC ID Token Trust Provider failed to resolve token from source: {e}",
                    retryable=False,
                ) from e
        else:
            token = self.identity_token

        token_clean = token.strip() if token else ""
        if not token_clean:
            raise TrustProviderError(
                "OIDC ID Token Trust Provider requires a non-empty identity token",
                retryable=False,
            )

        return CollectedTrustProviderIdentity(client={"oidc": {"identityToken": token_clean}})
