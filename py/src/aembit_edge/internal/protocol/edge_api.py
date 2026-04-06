"""Low-level endpoint adapter for the Aembit Edge API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from ...retry import RetryPolicy
from .http_transport import EdgeHttpTransport, EdgeTransportRequest
from .types import (
    EdgeAuthRequestBody,
    EdgeAuthSuccessBody,
    EdgeCredentialsRequestBody,
    EdgeCredentialsSuccessBody,
    EdgeSuccessResponse,
)


@dataclass(slots=True, kw_only=True)
class EdgeApiRequestOptions:
    """Per-call options for Aembit Edge API operations."""

    resource_set: str | None = None
    timeout_ms: int | None = None
    retry: RetryPolicy | None = None


class EdgeApi:
    """Low-level Aembit Edge API adapter for endpoint-specific request construction."""

    def __init__(
        self,
        *,
        transport: EdgeHttpTransport,
        resource_set: str | None = None,
    ) -> None:
        self._transport = transport
        self._resource_set = resource_set

    def auth(
        self,
        body: EdgeAuthRequestBody,
        options: EdgeApiRequestOptions | None = None,
    ) -> EdgeAuthSuccessBody:
        effective_options = options or EdgeApiRequestOptions()
        response: EdgeSuccessResponse[object] = self._transport.request_json(
            EdgeTransportRequest(
                operation="auth",
                path="/edge/v1/auth",
                method="POST",
                headers=_build_headers(
                    bearer_token=None,
                    resource_set=(
                        effective_options.resource_set
                        if effective_options.resource_set is not None
                        else self._resource_set
                    ),
                ),
                body=body,
                timeout_ms=effective_options.timeout_ms,
                retry=effective_options.retry,
            )
        )
        return cast(EdgeAuthSuccessBody, response.body)

    def credentials(
        self,
        body: EdgeCredentialsRequestBody,
        bearer_token: str,
        options: EdgeApiRequestOptions | None = None,
    ) -> EdgeCredentialsSuccessBody:
        effective_options = options or EdgeApiRequestOptions()
        response: EdgeSuccessResponse[object] = self._transport.request_json(
            EdgeTransportRequest(
                operation="credentials",
                path="/edge/v1/credentials",
                method="POST",
                headers=_build_headers(
                    bearer_token=bearer_token,
                    resource_set=(
                        effective_options.resource_set
                        if effective_options.resource_set is not None
                        else self._resource_set
                    ),
                ),
                body=body,
                timeout_ms=effective_options.timeout_ms,
                retry=effective_options.retry,
            )
        )
        return cast(EdgeCredentialsSuccessBody, response.body)


def _build_headers(
    *,
    bearer_token: str | None,
    resource_set: str | None,
) -> dict[str, str | None]:
    return {
        "Authorization": None if bearer_token is None else f"Bearer {bearer_token}",
        "X-Aembit-ResourceSet": resource_set,
        "Content-Type": "application/json",
    }
