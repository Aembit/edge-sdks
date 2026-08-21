# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public credential request and response types."""

from dataclasses import dataclass, field
from typing import Literal

from .internal.protocol.types import ConnectionMetadata
from .retry import RetryPolicy
from .types import JsonObject

CredentialPayload = JsonObject


def _empty_credential_payload() -> CredentialPayload:
    return {}


@dataclass(slots=True, kw_only=True)
class CredentialServerRef:
    """Server reference used by :meth:`aembit_edge.EdgeClient.get_credential`."""

    host: str
    port: int
    transport_protocol: Literal["TCP"] = "TCP"


@dataclass(slots=True, kw_only=True)
class GetCredentialInput:
    """Input contract for credential retrieval."""

    server: CredentialServerRef
    credential_type: str | None = None
    connection_metadata: ConnectionMetadata | None = None
    cert_signing_request: str | None = None


@dataclass(slots=True, kw_only=True)
class GetCredentialOptions:
    """Optional per-call behavior overrides for credential retrieval."""

    resource_set: str | None = None
    retry: RetryPolicy | None = None


@dataclass(slots=True, kw_only=True)
class CredentialResult:
    """Credential payload returned by the Aembit Edge API."""

    data: CredentialPayload = field(default_factory=_empty_credential_payload)
    credential_type: str | None = None
    expires_at: str | None = None
