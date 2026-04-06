"""Public Trust Provider contracts."""

from dataclasses import dataclass
from typing import Literal, Protocol, TypeAlias, runtime_checkable

from ..types import JsonObject

TrustProviderKind: TypeAlias = Literal[
    "aws_metadata_service",
    "aws_role",
    "azure_metadata_service",
    "gcp_identity_token",
    "oidc_id_token",
]
ClientWorkloadDetails: TypeAlias = JsonObject


@dataclass(slots=True, kw_only=True)
class CollectedTrustProviderIdentity:
    """Provider-specific workload identity payload and cache metadata."""

    client: ClientWorkloadDetails
    auth_cache_key: str | None = None


@runtime_checkable
class TrustProvider(Protocol):
    """Runtime-specific Trust Provider contract."""

    id: str
    kind: TrustProviderKind | str

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect provider-specific client workload identity data."""
        ...


class AsyncTrustProvider(Protocol):
    """Async runtime-specific Trust Provider contract."""

    id: str
    kind: TrustProviderKind | str

    async def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect provider-specific client workload identity data."""
        ...
