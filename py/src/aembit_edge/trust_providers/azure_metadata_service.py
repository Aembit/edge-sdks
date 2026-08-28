# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public Azure Metadata Service (IMDS) Trust Provider surface."""

from __future__ import annotations

import json
import time
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from ..errors import TrustProviderError
from ..internal.retry import (
    EffectiveRetryPolicy,
    calculate_backoff_delay_ms,
    is_retryable_error,
    merge_retry_policy,
)
from ..retry import RetryPolicy
from .base import CollectedTrustProviderIdentity

DEFAULT_PROVIDER_ID = "azure-metadata-service"
DEFAULT_IMDS_BASE_URL = "http://169.254.169.254"
DEFAULT_IMDS_TIMEOUT_MS = 1000
DEFAULT_IMDS_API_VERSION = "2025-04-07"


class SleepFn(Protocol):
    """Sleep hook for retry backoff."""

    def __call__(self, seconds: float, /) -> None:
        """Pause before the next retry attempt."""
        ...


def default_nonce_generator() -> str:
    """Generate a standard 10-digit nonce using timestamp pad."""
    return str(int(time.time())).zfill(10)


@dataclass(slots=True)
class AzureMetadataServiceTrustProvider:
    """Built-in Azure Instance Metadata Service (IMDS) Trust Provider.

    This provider fetches Azure IMDS attested-data and sends the PKCS#7
    signature blob plus the request nonce as
    `client.azure.attestedDocument.{encoding,signature,nonce}` in `/edge/v1/auth`.
    """

    id: str = DEFAULT_PROVIDER_ID
    base_url: str = DEFAULT_IMDS_BASE_URL
    api_version: str = DEFAULT_IMDS_API_VERSION
    timeout_ms: int = DEFAULT_IMDS_TIMEOUT_MS
    retry: RetryPolicy | None = None
    sleep: SleepFn = time.sleep
    nonce: Callable[[], str] = default_nonce_generator

    kind = "azure_metadata_service"

    def __post_init__(self) -> None:
        """Normalize options after dataclass construction."""
        self.id = self.id.strip() if self.id else ""
        if not self.id:
            self.id = DEFAULT_PROVIDER_ID

        self.base_url = self.base_url.strip() if self.base_url else ""
        if not self.base_url:
            self.base_url = DEFAULT_IMDS_BASE_URL

        self.api_version = self.api_version.strip() if self.api_version else ""
        if not self.api_version:
            self.api_version = DEFAULT_IMDS_API_VERSION

        if self.timeout_ms <= 0:
            self.timeout_ms = DEFAULT_IMDS_TIMEOUT_MS

    def get_identity_single_flight_key(self) -> str:
        """Declare Azure Metadata identity as stable for a client instance."""
        return f"{self.kind}:{self.id}"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        """Collect Azure IMDS attested document for `/edge/v1/auth`."""
        effective_retry_policy = merge_retry_policy(self.retry)
        max_attempts = (
            effective_retry_policy.max_attempts
            if effective_retry_policy.enabled
            else 1
        )

        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                return self._collect_identity_once()
            except Exception as error:
                mapped_error = _map_imds_error(error)
                last_error = mapped_error
                self._handle_attempt_failure(
                    attempt, max_attempts, mapped_error, effective_retry_policy
                )
        else:  # pragma: no cover
            if last_error is not None:
                raise last_error
            raise RuntimeError("unreachable retry state")

    def _handle_attempt_failure(
        self,
        attempt: int,
        max_attempts: int,
        error: TrustProviderError,
        policy: EffectiveRetryPolicy,
    ) -> None:
        """Handle a failed collection attempt, performing backoff or raising immediately."""
        if not is_retryable_error(error) or attempt >= max_attempts:
            raise error

        delay_ms = calculate_backoff_delay_ms(attempt, policy)
        if delay_ms > 0:
            self.sleep(delay_ms / 1000)

    def _collect_identity_once(self) -> CollectedTrustProviderIdentity:
        timeout_sec = self.timeout_ms / 1000.0

        # Generate and validate nonce
        nonce_val = self.nonce().strip()
        if not nonce_val or len(nonce_val) != 10 or not nonce_val.isdigit():
            raise TrustProviderError(
                "Azure Instance Metadata Service Trust Provider requires a 10-digit nonce",
                retryable=False,
            )

        # 1. Fetch Attested Document (GET request)
        url = (
            f"{self.base_url}/metadata/attested/document"
            f"?api-version={self.api_version}&nonce={nonce_val}"
        )
        req = urllib.request.Request(
            url,
            method="GET",
            headers={"Metadata": "true"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as response:
                body_bytes = response.read()
        except Exception as e:
            raise TrustProviderError(
                f"Azure Instance Metadata Service attested document request failed: {e}",
                retryable=True,
            ) from e

        # 2. Parse response body
        try:
            body_str = body_bytes.decode("utf-8")
            body_json = json.loads(body_str)
        except Exception as e:
            raise TrustProviderError(
                "Azure Instance Metadata Service returned an invalid attested document response",
                retryable=False,
            ) from e

        if not isinstance(body_json, dict):
            raise TrustProviderError(
                "Azure Instance Metadata Service returned an invalid attested document response",
                retryable=False,
            )

        from typing import cast
        body_dict = cast("dict[str, object]", body_json)

        # Cast keys safely using isinstance checks to satisfy strict Pyright typings
        signature_raw = body_dict.get("signature")
        if not isinstance(signature_raw, str):
            raise TrustProviderError(
                "Azure Instance Metadata Service returned an empty attested document signature",
                retryable=False,
            )
        signature = signature_raw.strip()
        if not signature:
            raise TrustProviderError(
                "Azure Instance Metadata Service returned an empty attested document signature",
                retryable=False,
            )

        encoding_raw = body_dict.get("encoding")
        encoding = "pkcs7"
        if isinstance(encoding_raw, str):
            encoding_clean = encoding_raw.strip()
            if encoding_clean:
                encoding = encoding_clean

        return CollectedTrustProviderIdentity(
            client={
                "azure": {
                    "attestedDocument": {
                        "encoding": encoding,
                        "signature": signature,
                        "nonce": nonce_val,
                    }
                }
            }
        )


def _map_imds_error(error: Exception) -> TrustProviderError:
    """Map errors to TrustProviderError."""
    if isinstance(error, TrustProviderError):
        return error
    return TrustProviderError(
        f"Azure Instance Metadata Service Trust Provider failed: {error}", retryable=True
    )
