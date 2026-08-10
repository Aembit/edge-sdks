"""Public AWS Role Trust Provider surface."""

from __future__ import annotations

import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from botocore.exceptions import (
    CredentialRetrievalError,
    NoCredentialsError,
    PartialCredentialsError,
)

from ..errors import TrustProviderError
from ..internal.retry import (
    calculate_backoff_delay_ms,
    is_retryable_error,
    merge_retry_policy,
)
from ..internal.trust_providers import (
    AwsRoleSignedRequestData,
    build_aws_sts_get_caller_identity_signed_data,
)
from ..retry import RetryPolicy
from .base import CollectedTrustProviderIdentity

DEFAULT_PROVIDER_ID = "aws-role"


class AwsRoleSigner(Protocol):
    """Callable signer hook for AWS STS GetCallerIdentity request data."""

    def __call__(self, *, region: str) -> AwsRoleSignedRequestData:
        """Return signed request data for the given AWS region."""
        ...


class SleepFn(Protocol):
    """Sleep hook for retry backoff."""

    def __call__(self, seconds: float, /) -> None:
        """Pause before the next retry attempt."""
        ...


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
    sleep: SleepFn = time.sleep

    kind = "aws_role"

    def __post_init__(self) -> None:
        """Normalize the public provider id after dataclass construction."""

        self.id = _resolve_provider_id(self.id)

    def get_identity_single_flight_key(self) -> str:
        """Declare AWS Role identity as stable for a client instance."""

        return f"{self.kind}:{self.id}"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect signed STS request data for `/edge/v1/auth`."""

        region = _resolve_region(self.region)
        effective_retry_policy = merge_retry_policy(self.retry)
        max_attempts = effective_retry_policy.max_attempts if effective_retry_policy.enabled else 1

        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                signed_data = self.signer(region=region)
                break
            except Exception as error:
                mapped_error = _map_role_signer_error(error)
                last_error = mapped_error
                if not is_retryable_error(mapped_error) or attempt >= max_attempts:
                    if mapped_error is error:
                        raise error
                    raise mapped_error from error

                delay_ms = calculate_backoff_delay_ms(attempt, effective_retry_policy)
                if delay_ms > 0:
                    self.sleep(delay_ms / 1000)
        else:  # pragma: no cover - defensive state
            if last_error is not None:
                raise last_error
            raise RuntimeError("unreachable retry state")

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
    """Return a stable provider id, falling back to the default when blank."""

    provider_id = value.strip() if isinstance(value, str) else ""
    return provider_id or DEFAULT_PROVIDER_ID


def _resolve_region(value: object) -> str:
    """Trim and validate the public AWS region option."""

    region = value.strip() if isinstance(value, str) else ""
    if not region:
        raise TrustProviderError(
            "AWS Role Trust Provider requires a non-empty region",
            retryable=False,
        )
    return region


def _normalize_headers(headers: Mapping[str, object]) -> dict[str, str]:
    """Validate signer headers and copy them into a plain string mapping."""

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


def _map_role_signer_error(error: Exception) -> TrustProviderError:
    """Translate signer and credential failures into stable SDK errors."""

    if isinstance(error, TrustProviderError):
        return error

    if isinstance(error, (NoCredentialsError, CredentialRetrievalError)):
        return TrustProviderError(
            "AWS Role Trust Provider could not resolve AWS credentials",
            retryable=True,
        )

    if isinstance(error, PartialCredentialsError) or _is_non_retryable_credential_error(error):
        return TrustProviderError(
            "AWS Role Trust Provider could not resolve AWS credentials",
            retryable=False,
        )

    return TrustProviderError(
        "AWS Role Trust Provider failed to build STS GetCallerIdentity request data",
        retryable=False,
    )


def _is_non_retryable_credential_error(error: Exception) -> bool:
    """Detect deterministic credential shape failures from local validation."""

    if not isinstance(error, ValueError):
        return False

    message = str(error).lower()
    return "accesskeyid" in message or "secretaccesskey" in message
