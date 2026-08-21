# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public SDK exception types."""

from typing import Literal

EdgeErrorKind = Literal["transport", "api", "auth", "credential", "trust_provider", "unknown"]


class EdgeSdkError(Exception):
    """Base exception type for SDK-defined failures."""

    def __init__(
        self,
        message: str,
        *,
        kind: EdgeErrorKind = "unknown",
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code
        self.api_code = api_code
        self.request_id = request_id
        self.retryable = retryable


class TransportError(EdgeSdkError):
    """Transport or network failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(
            message,
            kind="transport",
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )


class ApiError(EdgeSdkError):
    """API response failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(
            message,
            kind="api",
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )


class AuthError(EdgeSdkError):
    """Authentication failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(
            message,
            kind="auth",
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )


class CredentialError(EdgeSdkError):
    """Credential retrieval failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(
            message,
            kind="credential",
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )


class TrustProviderError(EdgeSdkError):
    """Trust Provider failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        api_code: str | None = None,
        request_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(
            message,
            kind="trust_provider",
            status_code=status_code,
            api_code=api_code,
            request_id=request_id,
            retryable=retryable,
        )
