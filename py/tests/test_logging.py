# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Tests for SDK internal logging behavior and safety."""

import importlib
import json
import logging
from typing import cast

import pytest

import aembit_edge
from aembit_edge import (
    CollectedTrustProviderIdentity,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    TrustProvider,
    TrustProviderError,
)
from aembit_edge.internal.protocol import EdgeApi, EdgeHttpTransport, RawHttpResponse


class HarnessEdgeClient(EdgeClient):
    def set_api_for_test(self, api: EdgeApi) -> None:
        self._api = api


class _MockTrustProvider:
    id = "mock-provider"
    kind = "mock"

    def __init__(self, identity_data: dict[str, object] | None = None) -> None:
        self._identity_data = identity_data or {"aws": {"instanceIdentityDocument": "mock-doc"}}

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(
            client=self._identity_data,  # type: ignore[arg-type]
            auth_cache_key="test-cache-key",
        )


class _FailingTrustProvider:
    id = "failing-provider"
    kind = "mock"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        raise TrustProviderError("Failed to collect metadata", retryable=False)


class SenderStub:
    def __init__(self, responses: list[RawHttpResponse | Exception]) -> None:
        self._responses = responses
        self.calls: list[dict[str, object]] = []

    def __call__(
        self,
        *,
        url: str,
        method: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_ms: int | None,
    ) -> RawHttpResponse:
        self.calls.append(
            {
                "url": url,
                "method": method,
                "headers": headers,
                "body": None if body is None else json.loads(body.decode("utf-8")),
                "timeout_ms": timeout_ms,
            }
        )
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def _create_harness_client(
    responses: list[RawHttpResponse | Exception],
    trust_provider: TrustProvider | None = None,
) -> HarnessEdgeClient:
    tp = trust_provider or cast(TrustProvider, _MockTrustProvider())
    config = EdgeClientConfig(
        base_url="https://tenant.aembit.io",
        client_id="test-client-id",
        trust_provider=tp,
    )
    client = HarnessEdgeClient(config)
    sender = SenderStub(responses)
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url=config.base_url,
                timeout_ms=config.timeout_ms,
                retry=config.retry,
                sender=sender,
            ),
            resource_set=config.resource_set,
        )
    )
    return client


def test_null_handler_configured_on_root_logger() -> None:
    """Verify that aembit_edge logger is configured with a NullHandler by default."""
    logger = logging.getLogger("aembit_edge")
    null_handlers = [h for h in logger.handlers if isinstance(h, logging.NullHandler)]
    assert len(null_handlers) >= 1


def test_null_handler_idempotent_on_module_reload() -> None:
    """Verify that reloading the module does not accumulate duplicate NullHandlers."""
    logger = logging.getLogger("aembit_edge")
    initial_null_handlers = [h for h in logger.handlers if isinstance(h, logging.NullHandler)]
    assert len(initial_null_handlers) == 1

    importlib.reload(aembit_edge)

    reloaded_null_handlers = [h for h in logger.handlers if isinstance(h, logging.NullHandler)]
    assert len(reloaded_null_handlers) == 1


def test_default_silent_execution(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Verify that EdgeClient produces no console/stream output by default."""
    client = _create_harness_client(
        [
            RawHttpResponse(
                status=200,
                headers={"content-type": "application/json"},
                body=json.dumps(
                    {"accessToken": "test-token", "tokenType": "Bearer", "expiresIn": 3600}
                ),
            ),
            RawHttpResponse(
                status=200,
                headers={"content-type": "application/json"},
                body=json.dumps(
                    {"credentialType": "ApiKey", "expiresAt": None, "data": {"key": "secret-key"}}
                ),
            ),
        ]
    )

    client.authenticate()
    client.get_credential(
        GetCredentialInput(
            server=CredentialServerRef(host="db.internal", port=5432), credential_type="ApiKey"
        )
    )

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_logging_events_emitted_during_auth_and_credential_retrieval(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify operational info and debug logs are emitted correctly."""
    caplog.set_level(logging.DEBUG, logger="aembit_edge")
    client = _create_harness_client(
        [
            RawHttpResponse(
                status=200,
                headers={"content-type": "application/json"},
                body=json.dumps(
                    {"accessToken": "super-secret-token", "tokenType": "Bearer", "expiresIn": 3600}
                ),
            ),
            RawHttpResponse(
                status=200,
                headers={"content-type": "application/json"},
                body=json.dumps(
                    {
                        "credentialType": "ApiKey",
                        "expiresAt": "2030-01-01T00:00:00Z",
                        "data": {"apiKey": "super-secret-key-value"},
                    }
                ),
            ),
        ]
    )

    # 1. Authenticate
    session = client.authenticate()
    assert session.trust_provider_id == "mock-provider"

    # 2. Retrieve credential (cache hit for token)
    result = client.get_credential(
        GetCredentialInput(
            server=CredentialServerRef(host="api.internal", port=443), credential_type="ApiKey"
        )
    )
    assert result.credential_type == "ApiKey"

    records = [r for r in caplog.records if r.name.startswith("aembit_edge")]
    messages = [r.getMessage() for r in records]

    # Verify key operational events are present
    assert any("EdgeClient initialized" in m for m in messages)
    assert any("Authenticating workload" in m for m in messages)
    assert any("Workload authenticated successfully" in m for m in messages)
    assert any("Retrieving credential" in m for m in messages)
    assert any("Reusing valid cached access token" in m for m in messages)
    assert any("Credential retrieved successfully" in m for m in messages)

    # Verify zero secrets are leaked in any log record
    for record in records:
        msg = record.getMessage()
        assert "super-secret-token" not in msg
        assert "super-secret-key-value" not in msg


def test_error_logging_on_failure(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verify error logs are recorded when operations fail."""
    caplog.set_level(logging.DEBUG, logger="aembit_edge")
    client = _create_harness_client(
        [],
        trust_provider=cast(TrustProvider, _FailingTrustProvider()),
    )

    with pytest.raises(TrustProviderError):
        client.authenticate()

    records = [r for r in caplog.records if r.name.startswith("aembit_edge")]
    error_records = [r for r in records if r.levelno == logging.ERROR]
    assert len(error_records) >= 1
    assert any("failed to collect identity" in r.getMessage() for r in error_records)
