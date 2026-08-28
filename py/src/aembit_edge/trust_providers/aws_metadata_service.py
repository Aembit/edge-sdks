# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public AWS Metadata Service (IMDS) Trust Provider surface."""

from __future__ import annotations

import base64
import time
import urllib.request
from dataclasses import dataclass
from typing import ClassVar, Protocol

from ..errors import TrustProviderError
from ..retry import RetryPolicy
from .base import CollectedTrustProviderIdentity

DEFAULT_PROVIDER_ID = "aws-metadata-service"
DEFAULT_IMDS_BASE_URL = "http://169.254.169.254"
DEFAULT_IMDS_TIMEOUT_MS = 1000
DEFAULT_IMDS_TOKEN_TTL_SECONDS = 2160


class SleepFn(Protocol):
    """Sleep hook for retry backoff."""

    def __call__(self, seconds: float, /) -> None:
        """Pause before the next retry attempt."""
        ...


@dataclass(slots=True)
class AwsMetadataServiceTrustProvider:
    """Built-in AWS Metadata Service (IMDS) Trust Provider.

    The provider collects `client.aws.instanceIdentityDocument` and
    `client.aws.instanceIdentityDocumentSignature` payload content
    via IMDSv2 for `/edge/v1/auth` requests.
    """

    id: str = DEFAULT_PROVIDER_ID
    base_url: str = DEFAULT_IMDS_BASE_URL
    timeout_ms: int = DEFAULT_IMDS_TIMEOUT_MS
    token_ttl_seconds: int = DEFAULT_IMDS_TOKEN_TTL_SECONDS
    retry: RetryPolicy | None = None
    sleep: SleepFn = time.sleep

    kind: ClassVar[str] = "aws_metadata_service"

    def __post_init__(self) -> None:
        """Normalize options after dataclass construction."""
        self.id = self.id.strip() if self.id else ""
        if not self.id:
            self.id = DEFAULT_PROVIDER_ID

        self.base_url = self.base_url.strip() if self.base_url else ""
        if not self.base_url:
            self.base_url = DEFAULT_IMDS_BASE_URL

        if self.timeout_ms <= 0:
            self.timeout_ms = DEFAULT_IMDS_TIMEOUT_MS

        if self.token_ttl_seconds <= 0:
            self.token_ttl_seconds = DEFAULT_IMDS_TOKEN_TTL_SECONDS

    def get_identity_single_flight_key(self) -> str:
        """Declare AWS Metadata identity as stable for a client instance."""
        return f"{self.kind}:{self.id}"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect AWS IMDSv2 metadata for `/edge/v1/auth`."""
        from ..internal.retry import execute_with_retry

        return execute_with_retry(
            action=self._collect_identity_once,
            retry=self.retry,
            map_error=_map_imds_error,
            sleep=self.sleep,
        )

    def _collect_identity_once(self) -> CollectedTrustProviderIdentity:
        timeout_sec = self.timeout_ms / 1000.0

        # 1. Fetch IMDSv2 Token (PUT request)
        token_url = f"{self.base_url}/latest/api/token"
        token_req = urllib.request.Request(
            token_url,
            method="PUT",
            headers={"x-aws-ec2-metadata-token-ttl-seconds": str(self.token_ttl_seconds)},
        )
        try:
            with urllib.request.urlopen(token_req, timeout=timeout_sec) as response:
                token = response.read().decode("utf-8").strip()
        except Exception as e:
            raise TrustProviderError(f"Failed to fetch IMDSv2 token: {e}", retryable=True) from e

        if not token:
            raise TrustProviderError("IMDSv2 token response was empty", retryable=True)

        auth_headers = {"x-aws-ec2-metadata-token": token}

        # 2. Fetch Instance Identity Document (GET request)
        doc_url = f"{self.base_url}/latest/dynamic/instance-identity/document"
        doc_req = urllib.request.Request(doc_url, method="GET", headers=auth_headers)
        try:
            with urllib.request.urlopen(doc_req, timeout=timeout_sec) as response:
                document = response.read().decode("utf-8")
        except Exception as e:
            raise TrustProviderError(
                f"Failed to fetch instance identity document: {e}", retryable=True
            ) from e

        # 3. Fetch Instance Identity Document Signature (GET request)
        sig_url = f"{self.base_url}/latest/dynamic/instance-identity/signature"
        sig_req = urllib.request.Request(sig_url, method="GET", headers=auth_headers)
        try:
            with urllib.request.urlopen(sig_req, timeout=timeout_sec) as response:
                signature = (
                    response.read().decode("utf-8").strip().replace("\n", "").replace("\r", "")
                )
        except Exception as e:
            raise TrustProviderError(
                f"Failed to fetch instance identity document signature: {e}", retryable=True
            ) from e

        # Base64-encode the document exactly as expected by the backend
        b64_document = base64.b64encode(document.encode("utf-8")).decode("utf-8")

        return CollectedTrustProviderIdentity(
            client={
                "aws": {
                    "instanceIdentityDocument": b64_document,
                    "instanceIdentityDocumentSignature": signature,
                }
            }
        )


def _map_imds_error(error: Exception) -> TrustProviderError:
    """Map errors to TrustProviderError."""
    if isinstance(error, TrustProviderError):
        return error
    return TrustProviderError(
        f"AWS Metadata Service Trust Provider failed: {error}", retryable=True
    )
