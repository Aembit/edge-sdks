"""Sync HTTP transport for the Aembit Edge API."""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from ...errors import EdgeSdkError, TransportError
from ...retry import RetryPolicy
from .errors import map_http_error, map_transport_error
from .retry import (
    calculate_backoff_delay_ms,
    is_retryable_error,
    merge_retry_overrides,
    merge_retry_policy,
)
from .types import EdgeOperation, EdgeResponseHeaders, EdgeSuccessResponse


@dataclass(slots=True, kw_only=True)
class EdgeTransportRequest:
    """Per-request transport settings and request payload."""

    operation: EdgeOperation
    path: str
    method: str = "POST"
    headers: Mapping[str, str | None] | None = None
    body: object = None
    timeout_ms: int | None = None
    retry: RetryPolicy | None = None


@dataclass(slots=True, kw_only=True)
class RawHttpResponse:
    """Raw HTTP response returned by the sender implementation."""

    status: int
    headers: EdgeResponseHeaders
    body: str


class EdgeHttpTransport:
    """HTTP transport used by the protocol layer."""

    def __init__(
        self,
        *,
        base_url: str,
        timeout_ms: int | None = None,
        retry: RetryPolicy | None = None,
        sender: HttpSender | None = None,
        sleep: SleepFn | None = None,
    ) -> None:
        self._base_url = base_url
        self._timeout_ms = timeout_ms
        self._retry = retry
        self._sender = sender or default_http_sender
        self._sleep = sleep or time.sleep

    def request_json(
        self,
        request: EdgeTransportRequest,
    ) -> EdgeSuccessResponse[object]:
        """Execute an HTTP request, parse JSON, and apply retry/error mapping."""

        effective_retry_override = merge_retry_overrides(self._retry, request.retry)
        effective_retry_policy = merge_retry_policy(effective_retry_override)
        max_attempts = effective_retry_policy.max_attempts if effective_retry_policy.enabled else 1

        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                return self._request_json_once(
                    request,
                    retry_on_status_codes=effective_retry_policy.retry_on_status_codes,
                )
            except Exception as error:  # pragma: no cover - defensive path exercised in tests
                last_error = error
                if not is_retryable_error(error) or attempt >= max_attempts:
                    raise

                delay_ms = calculate_backoff_delay_ms(attempt, effective_retry_policy)
                if delay_ms > 0:
                    self._sleep(delay_ms / 1000)

        if last_error is not None:
            raise last_error
        raise RuntimeError("unreachable retry state")

    def _request_json_once(
        self,
        request: EdgeTransportRequest,
        *,
        retry_on_status_codes: tuple[int, ...],
    ) -> EdgeSuccessResponse[object]:
        try:
            url = _resolve_request_url(self._base_url, request.path)
            method = request.method.upper()
            if method == "GET" and request.body is not None:
                raise ValueError(f"HTTP {method} requests cannot include a body")

            headers = _normalize_request_headers(request.headers)
            body = None if request.body is None else json.dumps(request.body).encode("utf-8")
            if body is not None and not _has_header(headers, "content-type"):
                headers["content-type"] = "application/json"
        except Exception as error:
            raise map_transport_error(
                error,
                message="Edge transport request failed",
                retryable=False,
            ) from error

        timeout_ms = request.timeout_ms if request.timeout_ms is not None else self._timeout_ms

        try:
            response = self._sender(
                url=url,
                method=method,
                headers=headers,
                body=body,
                timeout_ms=timeout_ms,
            )
            parsed = _parse_json_body(response.body)
            if 200 <= response.status < 300:
                if parsed.kind != "valid":
                    message = (
                        "Edge response body is empty for JSON request"
                        if parsed.kind == "empty"
                        else "Edge response body is not valid JSON"
                    )
                    raise TransportError(message, retryable=False)

                return EdgeSuccessResponse(
                    status=response.status,
                    body=parsed.value,
                    headers=response.headers,
                )

            raise map_http_error(
                operation=request.operation,
                status_code=response.status,
                body=parsed.value if parsed.kind == "valid" else None,
                headers=response.headers,
                retry_on_status_codes=retry_on_status_codes,
            )
        except EdgeSdkError:
            raise
        except Exception as error:
            raise map_transport_error(error) from error


class HttpSender(Protocol):
    """Callable protocol for sync HTTP sender implementations."""

    def __call__(
        self,
        *,
        url: str,
        method: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_ms: int | None,
    ) -> RawHttpResponse: ...


SleepFn = Callable[[float], None]


@dataclass(slots=True, kw_only=True)
class _ParsedJsonBody:
    kind: str
    value: object = None


def default_http_sender(
    *,
    url: str,
    method: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout_ms: int | None,
) -> RawHttpResponse:
    request = urllib_request.Request(
        url=url,
        data=body,
        headers=headers,
        method=method,
    )
    timeout_seconds = None if timeout_ms is None or timeout_ms <= 0 else timeout_ms / 1000

    try:
        with urllib_request.urlopen(request, timeout=timeout_seconds) as response:
            raw_body = response.read().decode("utf-8")
            return RawHttpResponse(
                status=response.getcode(),
                headers=_normalize_response_headers(list(response.headers.items())),
                body=raw_body,
            )
    except urllib_error.HTTPError as error:
        raw_body = error.read().decode("utf-8")
        return RawHttpResponse(
            status=error.code,
            headers=_normalize_response_headers(list(error.headers.items())),
            body=raw_body,
        )


def _resolve_request_url(base_url: str, path: str) -> str:
    base = base_url if base_url.endswith("/") else f"{base_url}/"
    return urllib_parse.urljoin(base, path.lstrip("/"))


def _normalize_request_headers(
    headers: Mapping[str, str | None] | None,
) -> dict[str, str]:
    normalized: dict[str, str] = {}
    if headers is None:
        return normalized

    for key, value in headers.items():
        if isinstance(value, str):
            normalized[key] = value
    return normalized


def _normalize_response_headers(
    headers: Mapping[object, object] | list[tuple[object, object]],
) -> EdgeResponseHeaders:
    normalized: EdgeResponseHeaders = {}
    if isinstance(headers, Mapping):
        for key, value in headers.items():
            if isinstance(key, str):
                normalized[key] = value if isinstance(value, str) else None
        return normalized

    for key, value in headers:
        normalized[str(key)] = str(value)
    return normalized


def _has_header(headers: Mapping[str, str], name: str) -> bool:
    needle = name.lower()
    return any(key.lower() == needle for key in headers)


def _parse_json_body(raw: str) -> _ParsedJsonBody:
    if not raw:
        return _ParsedJsonBody(kind="empty")

    try:
        return _ParsedJsonBody(kind="valid", value=json.loads(raw))
    except json.JSONDecodeError:
        return _ParsedJsonBody(kind="invalid")
