"""Internal AWS Role Trust Provider helpers."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol, cast
from unittest.mock import patch

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
from botocore.exceptions import NoCredentialsError
from botocore.session import Session

STS_ACTION_BODY = "Action=GetCallerIdentity&Version=2011-06-15"
STS_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=utf-8"


@dataclass(slots=True, frozen=True)
class AwsRoleSignedRequestData:
    """Signed STS request data for `client.aws.stsGetCallerIdentity`."""

    headers: Mapping[str, object]
    region: str


@dataclass(slots=True, frozen=True)
class AwsCredentialIdentity:
    """Minimal AWS credential shape required for SigV4 signing."""

    access_key_id: str
    secret_access_key: str
    session_token: str | None = None


class AwsCredentialProvider(Protocol):
    """Credential resolver for the AWS Role signer."""

    def __call__(self) -> AwsCredentialIdentity: ...


class AwsClock(Protocol):
    """Clock hook for deterministic signing tests."""

    def __call__(self) -> datetime: ...


def build_aws_sts_get_caller_identity_signed_data(
    *,
    region: str,
    credentials_provider: AwsCredentialProvider | None = None,
    now: AwsClock | None = None,
) -> AwsRoleSignedRequestData:
    """Build SigV4-signed STS GetCallerIdentity request data."""

    normalized_region = _resolve_region(region)
    credentials = (credentials_provider or _resolve_default_credentials)()
    _assert_credentials(credentials)

    host = _resolve_sts_host(normalized_region)
    request = AWSRequest(
        method="POST",
        url=f"https://{host}/",
        data=STS_ACTION_BODY,
        headers={
            "host": host,
            "content-type": STS_CONTENT_TYPE,
        },
    )

    signer = SigV4Auth(
        Credentials(
            credentials.access_key_id,
            credentials.secret_access_key,
            credentials.session_token,
        ),
        "sts",
        normalized_region,
    )

    signing_time = _normalize_signing_time(now() if now is not None else None)
    if signing_time is None:
        cast(Any, signer).add_auth(request)
    else:
        with patch("botocore.auth.get_current_datetime", return_value=signing_time):
            cast(Any, signer).add_auth(request)

    return AwsRoleSignedRequestData(
        headers=_normalize_headers(cast(Any, request.headers).items()),
        region=normalized_region,
    )


def _resolve_default_credentials() -> AwsCredentialIdentity:
    credentials = cast(Any, Session().get_credentials())
    if credentials is None:
        raise NoCredentialsError()

    frozen = credentials.get_frozen_credentials()
    return AwsCredentialIdentity(
        access_key_id=cast(str, frozen.access_key),
        secret_access_key=cast(str, frozen.secret_key),
        session_token=cast(str | None, frozen.token),
    )


def _resolve_region(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("AWS Role Trust Provider requires a non-empty region")
    return normalized


def _resolve_sts_host(region: str) -> str:
    if region.startswith("cn-"):
        return f"sts.{region}.amazonaws.com.cn"
    return f"sts.{region}.amazonaws.com"


def _assert_credentials(credentials: AwsCredentialIdentity) -> None:
    if credentials.access_key_id.strip() == "":
        raise ValueError("AWS credential provider returned an empty accessKeyId")
    if credentials.secret_access_key.strip() == "":
        raise ValueError("AWS credential provider returned an empty secretAccessKey")


def _normalize_signing_time(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _normalize_headers(items: list[tuple[str, str]]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in items:
        normalized[key.lower()] = value
    return normalized
