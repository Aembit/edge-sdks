# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public Kubernetes Service Account Trust Provider surface."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import ClassVar

from ..errors import TrustProviderError
from .base import CollectedTrustProviderIdentity, TrustProviderKind

DEFAULT_PROVIDER_ID = "kubernetes-service-account"
DEFAULT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"


@dataclass(slots=True)
class KubernetesServiceAccountTrustProvider:
    """Built-in Kubernetes Service Account Trust Provider.

    This provider collects the `client.k8s.serviceAccountToken` payload content
    for `/edge/v1/auth` requests.
    """

    id: str = DEFAULT_PROVIDER_ID
    token_path: str = DEFAULT_TOKEN_PATH
    token: str | Callable[[], str] | None = None

    kind: ClassVar[TrustProviderKind] = "kubernetes_service_account"

    def __post_init__(self) -> None:
        """Normalize the public provider id and token path after dataclass construction."""
        normalized_id = self.id.strip() if self.id else ""
        self.id = normalized_id or DEFAULT_PROVIDER_ID

        normalized_path = self.token_path.strip() if self.token_path else ""
        self.token_path = normalized_path or DEFAULT_TOKEN_PATH

    def get_identity_single_flight_key(self) -> str | None:
        """Only static token strings are safe to de-duplicate."""
        return f"{self.kind}:{self.id}" if isinstance(self.token, str) else None

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect the Kubernetes Service Account token for `/edge/v1/auth`."""
        if self.token is not None:
            if callable(self.token):
                try:
                    resolved_token = self.token()
                except Exception as e:
                    raise TrustProviderError(
                        "Kubernetes Service Account Trust Provider failed to resolve token "
                        f"from source: {e}",
                        retryable=False,
                    ) from e
            else:
                resolved_token = self.token
        else:
            if not os.path.exists(self.token_path):
                raise TrustProviderError(
                    "Kubernetes Service Account Trust Provider token file not found at: "
                    f"{self.token_path}",
                    retryable=False,
                )
            try:
                with open(self.token_path, encoding="utf-8") as f:
                    resolved_token = f.read()
            except Exception as e:
                raise TrustProviderError(
                    f"Kubernetes Service Account Trust Provider failed to read token file: {e}",
                    retryable=False,
                ) from e

        token_clean = resolved_token.strip() if resolved_token else ""
        if not token_clean:
            raise TrustProviderError(
                "Kubernetes Service Account Trust Provider requires a non-empty service "
                "account token",
                retryable=False,
            )

        return CollectedTrustProviderIdentity(client={"k8s": {"serviceAccountToken": token_clean}})
