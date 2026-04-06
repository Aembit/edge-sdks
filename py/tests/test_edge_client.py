from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from types import MappingProxyType

import pytest

from aembit_edge import EdgeClient, EdgeClientConfig
from aembit_edge.credentials import CredentialServerRef, GetCredentialInput, GetCredentialOptions
from aembit_edge.errors import AuthError, CredentialError, TrustProviderError
from aembit_edge.internal.protocol import EdgeApi, EdgeHttpTransport, RawHttpResponse
from aembit_edge.internal.protocol.http_transport import HttpSender
from aembit_edge.retry import RetryPolicy
from aembit_edge.trust_providers import CollectedTrustProviderIdentity, TrustProvider


class HarnessEdgeClient(EdgeClient):
    def set_api_for_test(self, api: EdgeApi) -> None:
        self._api = api

    def set_now_ms_for_test(self, now_ms: Callable[[], int]) -> None:
        self._now_ms = now_ms


class StubTrustProvider:
    id = "stub-provider"
    kind = "aws_role"

    def __init__(self, identity: CollectedTrustProviderIdentity | Exception) -> None:
        self._identity = identity
        self.calls = 0

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        self.calls += 1
        if isinstance(self._identity, Exception):
            raise self._identity
        return self._identity


class InvalidTrustProvider:
    id = "invalid-provider"
    kind = "aws_role"

    def collect_identity(self) -> object:
        return {"client": {"aws": {"region": "us-east-1"}}}


class InvalidAuthCacheKeyTrustProvider:
    id = "invalid-auth-cache-key"
    kind = "aws_role"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(
            client={"aws": {"region": "us-east-1"}},
            auth_cache_key=object(),  # type: ignore[arg-type]
        )


class MappingProxyTrustProvider:
    id = "mapping-proxy-provider"
    kind = "aws_role"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(
            client=MappingProxyType({"aws": MappingProxyType({"region": "us-east-1"})})
        )


class InvalidClientPayloadTrustProvider:
    id = "invalid-client-payload"
    kind = "aws_role"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(
            client=MappingProxyType({1: "invalid"})  # type: ignore[dict-item]
        )


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


class BlockingAuthSender:
    def __init__(self) -> None:
        self.auth_started = threading.Event()
        self.release_auth = threading.Event()
        self.lock = threading.Lock()
        self.auth_calls = 0
        self.credential_calls = 0

    def __call__(
        self,
        *,
        url: str,
        method: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout_ms: int | None,
    ) -> RawHttpResponse:
        del method, headers, body, timeout_ms

        if url.endswith("/edge/v1/auth"):
            with self.lock:
                self.auth_calls += 1
            self.auth_started.set()
            self.release_auth.wait(timeout=1)
            return RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            )

        with self.lock:
            self.credential_calls += 1
            credential_calls = self.credential_calls

        return RawHttpResponse(
            status=200,
            headers={},
            body=json.dumps({"data": {"token": f"value-{credential_calls}"}}),
        )


class BlockingIdentityTrustProvider:
    id = "blocking-provider"
    kind = "aws_role"

    def __init__(self) -> None:
        self.identity_started = threading.Event()
        self.release_identity = threading.Event()
        self.lock = threading.Lock()
        self.calls = 0

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        with self.lock:
            self.calls += 1
        self.identity_started.set()
        self.release_identity.wait(timeout=1)
        return CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})

    def get_identity_single_flight_key(self) -> str:
        return "blocking-provider"


class DynamicIdentityTrustProvider:
    id = "dynamic-provider"
    kind = "oidc_id_token"

    def __init__(self) -> None:
        self.identity_started = threading.Event()
        self.release_identity = threading.Event()
        self.lock = threading.Lock()
        self.calls = 0

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        with self.lock:
            self.calls += 1
            call_number = self.calls
        self.identity_started.set()
        self.release_identity.wait(timeout=1)
        return CollectedTrustProviderIdentity(
            client={"oidc": {"token": f"token-{call_number}"}},
            auth_cache_key=f"cache-{call_number}",
        )


class BlankSingleFlightKeyTrustProvider(DynamicIdentityTrustProvider):
    id = "blank-key-provider"

    def get_identity_single_flight_key(self) -> str:
        return ""


def build_client(
    *,
    sender: HttpSender,
    provider: TrustProvider | None = None,
) -> HarnessEdgeClient:
    trust_provider = provider or StubTrustProvider(
        CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
    )
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=trust_provider,
        )
    )
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url="https://tenant.aembit.io",
                sender=sender,
                retry=RetryPolicy(base_delay_ms=0, max_delay_ms=0, max_attempts=3),
                sleep=lambda _seconds: None,
            ),
            resource_set=client.config.resource_set,
        )
    )
    client.set_now_ms_for_test(lambda: 1_000_000)
    return client


def test_authenticate_returns_session_without_raw_token() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={"x-request-id": "req-1"},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            )
        ]
    )
    client = build_client(sender=sender)

    session = client.authenticate()

    assert session.trust_provider_id == "stub-provider"
    assert session.expires_at == "1970-01-01T00:18:40.000Z"
    assert not hasattr(session, "access_token")


def test_authenticate_merges_additional_client_workload_details_additively() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            )
        ]
    )
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(
                    client={"aws": {"region": "us-east-1", "role": None}}
                )
            ),
            client_workload_details={
                "aws": {"region": "us-west-2", "accountId": "123"},
                "sourceIp": "127.0.0.1",
            },
        )
    )
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url="https://tenant.aembit.io",
                sender=sender,
                sleep=lambda _seconds: None,
            ),
            resource_set=client.config.resource_set,
        )
    )
    client.set_now_ms_for_test(lambda: 1_000_000)

    client.authenticate()

    assert sender.calls[0]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {
            "aws": {"region": "us-east-1", "role": None, "accountId": "123"},
            "sourceIp": "127.0.0.1",
        },
    }


def test_get_credential_auto_authenticates_and_defaults_transport_protocol() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps(
                    {
                        "credentialType": "ApiKey",
                        "expiresAt": None,
                        "data": {"token": "value"},
                    }
                ),
            ),
        ]
    )
    client = build_client(sender=sender)

    result = client.get_credential(
        GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
    )

    assert result.credential_type == "ApiKey"
    assert result.data == {"token": "value"}
    assert sender.calls[1]["headers"] == {
        "Authorization": "Bearer token-1",
        "Content-Type": "application/json",
    }
    assert sender.calls[1]["body"] == {
        "client": {"aws": {"region": "us-east-1"}},
        "server": {"host": "db.internal", "port": 443, "transportProtocol": "TCP"},
    }


def test_get_credential_reuses_cached_token() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"data": {"token": "first"}}),
            ),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"data": {"token": "second"}}),
            ),
        ]
    )
    client = build_client(sender=sender)

    first = client.get_credential(
        GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
    )
    second = client.get_credential(
        GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
    )

    assert first.data == {"token": "first"}
    assert second.data == {"token": "second"}
    assert len(sender.calls) == 3


def test_get_credential_refreshes_expired_token_using_skew() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 30}),
            ),
            RawHttpResponse(status=200, headers={}, body=json.dumps({"data": {"token": "first"}})),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-2", "expiresIn": 30}),
            ),
            RawHttpResponse(status=200, headers={}, body=json.dumps({"data": {"token": "second"}})),
        ]
    )
    client = build_client(sender=sender)
    times = iter([1_000_000, 1_000_000, 1_029_500, 1_029_500, 1_029_500, 1_029_500])
    client.set_now_ms_for_test(lambda: next(times))

    client.get_credential(
        GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
    )
    client.get_credential(
        GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
    )

    assert sender.calls[0]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {"aws": {"region": "us-east-1"}},
    }
    assert sender.calls[2]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {"aws": {"region": "us-east-1"}},
    }


def test_authenticate_raises_auth_error_for_malformed_auth_payload() -> None:
    sender = SenderStub(
        [RawHttpResponse(status=200, headers={}, body=json.dumps({"expiresIn": 120}))]
    )
    client = build_client(sender=sender)

    with pytest.raises(AuthError):
        client.authenticate()


def test_get_credential_raises_credential_error_for_malformed_payload() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
            RawHttpResponse(status=200, headers={}, body=json.dumps({"data": None})),
        ]
    )
    client = build_client(sender=sender)

    with pytest.raises(CredentialError):
        client.get_credential(
            GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
        )


def test_transport_retries_retryable_auth_failures() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(status=500, headers={}, body=json.dumps({"message": "fail", "id": 1})),
            RawHttpResponse(status=500, headers={}, body=json.dumps({"message": "fail", "id": 1})),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
        ]
    )
    client = build_client(sender=sender)

    session = client.authenticate()

    assert session.trust_provider_id == "stub-provider"
    assert len(sender.calls) == 3


def test_get_credential_deduplicates_concurrent_auth_refreshes() -> None:
    sender = BlockingAuthSender()
    client = build_client(sender=sender)
    results: list[str] = []
    errors: list[Exception] = []

    def run_request() -> None:
        try:
            result = client.get_credential(
                GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
            )
            results.append(str(result.data["token"]))
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(target=run_request)
    second = threading.Thread(target=run_request)

    first.start()
    assert sender.auth_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    sender.release_auth.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert sender.auth_calls == 1
    assert sender.credential_calls == 2
    assert sorted(results) == ["value-1", "value-2"]


def test_get_credential_deduplicates_concurrent_identity_collection() -> None:
    sender = BlockingAuthSender()
    provider = BlockingIdentityTrustProvider()
    client = build_client(sender=sender, provider=provider)
    results: list[str] = []
    errors: list[Exception] = []

    def run_request() -> None:
        try:
            result = client.get_credential(
                GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443))
            )
            results.append(str(result.data["token"]))
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(target=run_request)
    second = threading.Thread(target=run_request)

    first.start()
    assert provider.identity_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    provider.release_identity.set()
    assert sender.auth_started.wait(timeout=1)
    sender.release_auth.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert provider.calls == 1
    assert sender.auth_calls == 1
    assert sender.credential_calls == 2
    assert sorted(results) == ["value-1", "value-2"]


def test_authenticate_does_not_deduplicate_dynamic_identity_collection() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-2", "expiresIn": 120}),
            ),
        ]
    )
    provider = DynamicIdentityTrustProvider()
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=provider,
        )
    )
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url="https://tenant.aembit.io",
                sender=sender,
                sleep=lambda _seconds: None,
            ),
            resource_set=client.config.resource_set,
        )
    )
    client.set_now_ms_for_test(lambda: 1_000_000)
    errors: list[Exception] = []

    def run_auth() -> None:
        try:
            client.authenticate()
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(target=run_auth)
    second = threading.Thread(target=run_auth)

    first.start()
    assert provider.identity_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    provider.release_identity.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert provider.calls == 2
    request_bodies = [call["body"] for call in sender.calls]
    assert {json.dumps(body, sort_keys=True) for body in request_bodies} == {
        json.dumps(
            {
                "clientId": "edge-sdk-client-id",
                "client": {"oidc": {"token": "token-1"}},
            },
            sort_keys=True,
        ),
        json.dumps(
            {
                "clientId": "edge-sdk-client-id",
                "client": {"oidc": {"token": "token-2"}},
            },
            sort_keys=True,
        ),
    }


def test_authenticate_does_not_deduplicate_blank_identity_single_flight_key() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            ),
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-2", "expiresIn": 120}),
            ),
        ]
    )
    provider = BlankSingleFlightKeyTrustProvider()
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=provider,
        )
    )
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url="https://tenant.aembit.io",
                sender=sender,
                sleep=lambda _seconds: None,
            ),
            resource_set=client.config.resource_set,
        )
    )
    client.set_now_ms_for_test(lambda: 1_000_000)
    errors: list[Exception] = []

    def run_auth() -> None:
        try:
            client.authenticate()
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(target=run_auth)
    second = threading.Thread(target=run_auth)

    first.start()
    assert provider.identity_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    provider.release_identity.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert provider.calls == 2
    assert sender.calls[0]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {"oidc": {"token": "token-1"}},
    }
    assert sender.calls[1]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {"oidc": {"token": "token-2"}},
    }


def test_get_credential_deduplicates_equivalent_retry_configs() -> None:
    sender = BlockingAuthSender()
    client = build_client(sender=sender)
    results: list[str] = []
    errors: list[Exception] = []

    def run_request(options: GetCredentialOptions | None = None) -> None:
        try:
            result = client.get_credential(
                GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443)),
                options,
            )
            results.append(str(result.data["token"]))
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(target=run_request)
    second = threading.Thread(
        target=run_request,
        args=(GetCredentialOptions(retry=RetryPolicy(max_attempts=3)),),
    )

    first.start()
    assert sender.auth_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    sender.release_auth.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert sender.auth_calls == 1
    assert sender.credential_calls == 2
    assert sorted(results) == ["value-1", "value-2"]


def test_get_credential_deduplicates_equivalent_disabled_retry_configs() -> None:
    sender = BlockingAuthSender()
    client = build_client(sender=sender)
    results: list[str] = []
    errors: list[Exception] = []

    def run_request(options: GetCredentialOptions) -> None:
        try:
            result = client.get_credential(
                GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443)),
                options,
            )
            results.append(str(result.data["token"]))
        except Exception as error:  # pragma: no cover - defensive
            errors.append(error)

    first = threading.Thread(
        target=run_request,
        args=(GetCredentialOptions(retry=RetryPolicy(enabled=False, max_attempts=2)),),
    )
    second = threading.Thread(
        target=run_request,
        args=(GetCredentialOptions(retry=RetryPolicy(enabled=False, max_attempts=5)),),
    )

    first.start()
    assert sender.auth_started.wait(timeout=1)
    second.start()
    time.sleep(0.05)
    sender.release_auth.set()
    first.join(timeout=1)
    second.join(timeout=1)

    assert not errors
    assert sender.auth_calls == 1
    assert sender.credential_calls == 2
    assert sorted(results) == ["value-1", "value-2"]


def test_trust_provider_errors_are_wrapped() -> None:
    sender = SenderStub([])
    client = build_client(sender=sender, provider=StubTrustProvider(RuntimeError("boom")))

    with pytest.raises(TrustProviderError):
        client.authenticate()


def test_invalid_trust_provider_output_is_wrapped() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=InvalidTrustProvider(),  # type: ignore[arg-type]
        )
    )

    with pytest.raises(TrustProviderError):
        client.authenticate()


def test_invalid_trust_provider_auth_cache_key_is_wrapped() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=InvalidAuthCacheKeyTrustProvider(),
        )
    )

    with pytest.raises(TrustProviderError):
        client.authenticate()


def test_mapping_proxy_trust_provider_payload_is_normalized() -> None:
    sender = SenderStub(
        [
            RawHttpResponse(
                status=200,
                headers={},
                body=json.dumps({"accessToken": "token-1", "expiresIn": 120}),
            )
        ]
    )
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=MappingProxyTrustProvider(),
        )
    )
    client.set_api_for_test(
        EdgeApi(
            transport=EdgeHttpTransport(
                base_url="https://tenant.aembit.io",
                sender=sender,
                sleep=lambda _seconds: None,
            ),
            resource_set=client.config.resource_set,
        )
    )
    client.set_now_ms_for_test(lambda: 1_000_000)

    client.authenticate()

    assert sender.calls[0]["body"] == {
        "clientId": "edge-sdk-client-id",
        "client": {"aws": {"region": "us-east-1"}},
    }


def test_invalid_trust_provider_client_payload_is_wrapped() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=InvalidClientPayloadTrustProvider(),
        )
    )

    with pytest.raises(TrustProviderError):
        client.authenticate()


def test_authenticate_rejects_invalid_retry_config_type() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
            ),
            retry={"max_attempts": 3},  # type: ignore[arg-type]
        )
    )

    with pytest.raises(CredentialError):
        client.authenticate()


def test_get_credential_rejects_invalid_retry_option_type() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
            ),
        )
    )

    with pytest.raises(CredentialError):
        client.get_credential(
            GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443)),
            GetCredentialOptions(retry={"max_attempts": 3}),  # type: ignore[arg-type]
        )


def test_authenticate_rejects_invalid_retry_status_codes() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
            ),
            retry=RetryPolicy(retry_on_status_codes=("oops",)),  # type: ignore[arg-type]
        )
    )

    with pytest.raises(CredentialError):
        client.authenticate()


def test_get_credential_rejects_invalid_retry_status_codes() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
            ),
        )
    )

    with pytest.raises(CredentialError):
        client.get_credential(
            GetCredentialInput(server=CredentialServerRef(host="db.internal", port=443)),
            GetCredentialOptions(
                retry=RetryPolicy(retry_on_status_codes=("oops",))  # type: ignore[arg-type]
            ),
        )


def test_authenticate_rejects_invalid_client_workload_details() -> None:
    client = HarnessEdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(
                CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})
            ),
            client_workload_details="invalid",  # type: ignore[arg-type]
        )
    )

    with pytest.raises(CredentialError):
        client.authenticate()
