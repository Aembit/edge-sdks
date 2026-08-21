# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
from dataclasses import asdict

from aembit_edge import (
    AsyncTrustProvider,
    AuthSession,
    CredentialResult,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
    RetryPolicy,
)
from aembit_edge.internal.trust_providers import AwsRoleSignedRequestData
from aembit_edge.trust_providers import (
    AwsRoleTrustProvider,
    CollectedTrustProviderIdentity,
    TrustProvider,
)


class StubTrustProvider:
    id = "stub"
    kind = "aws_role"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})


class StubAsyncTrustProvider:
    id = "stub-async"
    kind = "aws_role"

    async def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(client={"aws": {"region": "us-east-1"}})


def test_edge_client_is_constructible() -> None:
    config = EdgeClientConfig(
        base_url="https://tenant.aembit.io",
        client_id="edge-sdk-client-id",
        trust_provider=StubTrustProvider(),
        retry=RetryPolicy(max_attempts=3),
    )

    client = EdgeClient(config)

    assert client.config is config


def test_public_models_are_constructible() -> None:
    server = CredentialServerRef(host="db.internal", port=443)
    request = GetCredentialInput(server=server, credential_type="api_key")
    options = GetCredentialOptions(resource_set="example")
    payload = {"token": "value"}
    result = CredentialResult(data=payload, credential_type="api_key")
    session = AuthSession(
        expires_at=None,
        trust_provider_id="aws-role",
    )

    assert asdict(request) == {
        "server": {"host": "db.internal", "port": 443, "transport_protocol": "TCP"},
        "credential_type": "api_key",
        "connection_metadata": None,
        "cert_signing_request": None,
    }
    assert options.resource_set == "example"
    assert result.data["token"] == "value"
    assert session.expires_at is None
    assert session.trust_provider_id == "aws-role"


def test_retry_policy_preserves_unset_vs_empty_status_codes() -> None:
    assert RetryPolicy(max_attempts=3).retry_on_status_codes is None
    assert RetryPolicy(retry_on_status_codes=()).retry_on_status_codes == ()


def test_trust_provider_protocol_is_runtime_checkable() -> None:
    provider = StubTrustProvider()

    assert isinstance(provider, TrustProvider)


def test_async_trust_provider_protocol_is_exported_for_typing() -> None:
    provider: AsyncTrustProvider = StubAsyncTrustProvider()

    assert provider.kind == "aws_role"


def test_edge_client_methods_are_exposed() -> None:
    client = EdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="edge-sdk-client-id",
            trust_provider=StubTrustProvider(),
        )
    )

    assert callable(client.authenticate)
    assert callable(client.get_credential)


def test_aws_role_trust_provider_surface_is_exported() -> None:
    provider = AwsRoleTrustProvider(
        region="us-east-1",
        signer=lambda region: AwsRoleSignedRequestData(
            headers={"host": f"sts.{region}.amazonaws.com"},
            region=region,
        ),
    )

    assert provider.id == "aws-role"
    assert provider.kind == "aws_role"
    assert provider.get_identity_single_flight_key() == "aws_role:aws-role"
    assert isinstance(provider, TrustProvider)
