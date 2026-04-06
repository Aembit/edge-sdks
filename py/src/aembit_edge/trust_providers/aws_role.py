"""Public AWS Role Trust Provider surface."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from ..errors import TrustProviderError
from ..internal.trust_providers import (
    AwsRoleSignedRequestData,
    build_aws_sts_get_caller_identity_signed_data,
)
from ..retry import RetryPolicy
from .base import CollectedTrustProviderIdentity

DEFAULT_PROVIDER_ID = "aws-role"


class AwsRoleSigner(Protocol):
    """Callable signer hook for AWS STS GetCallerIdentity request data."""

    def __call__(self, *, region: str) -> AwsRoleSignedRequestData: ...


@dataclass(slots=True)
class AwsRoleTrustProvider:
    """Built-in AWS Role Trust Provider surface.

    The provider collects `client.aws.stsGetCallerIdentity` payload content
    for `/edge/v1/auth` requests. SigV4 signing is delegated to an internal
    signer hook so the public contract can remain stable while the signer
    implementation evolves independently.
    """

    region: str
    id: str = DEFAULT_PROVIDER_ID
    retry: RetryPolicy | None = None
    signer: AwsRoleSigner = build_aws_sts_get_caller_identity_signed_data

    kind = "aws_role"

    def __post_init__(self) -> None:
        self.id = _resolve_provider_id(self.id)

    def get_identity_single_flight_key(self) -> str:
        """Declare AWS Role identity as stable for a client instance."""

        return f"{self.kind}:{self.id}"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect signed STS request data for `/edge/v1/auth`."""

        region = _resolve_region(self.region)

        try:
            signed_data = self.signer(region=region)
        except TrustProviderError:
            raise
        except Exception as error:
            raise TrustProviderError(
                "AWS Role Trust Provider failed to build STS GetCallerIdentity request data",
                retryable=False,
            ) from error

        return CollectedTrustProviderIdentity(
            client={
                "aws": {
                    "stsGetCallerIdentity": {
                        "headers": _normalize_headers(signed_data.headers),
                        "region": _resolve_region(signed_data.region),
                    }
                }
            }
        )


def _resolve_provider_id(value: object) -> str:
    provider_id = value.strip() if isinstance(value, str) else ""
    return provider_id or DEFAULT_PROVIDER_ID


def _resolve_region(value: object) -> str:
    region = value.strip() if isinstance(value, str) else ""
    if not region:
        raise TrustProviderError(
            "AWS Role Trust Provider requires a non-empty region",
            retryable=False,
        )
    return region


def _normalize_headers(headers: Mapping[str, object]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in headers.items():
        if isinstance(value, str):
            normalized[key] = value
            continue
        raise TrustProviderError(
            "AWS Role Trust Provider returned invalid STS GetCallerIdentity header data",
            retryable=False,
        )
    return normalized
