# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public package exports for the Aembit Edge Python SDK."""

from .auth import AuthSession
from .client import EdgeClient
from .config import EdgeClientConfig
from .credentials import (
    ConnectionMetadata,
    CredentialResult,
    CredentialServerRef,
    GetCredentialInput,
    GetCredentialOptions,
)
from .errors import (
    ApiError,
    AuthError,
    CredentialError,
    EdgeSdkError,
    TransportError,
    TrustProviderError,
)
from .retry import RetryPolicy
from .trust_providers import (
    AsyncTrustProvider,
    ClientWorkloadDetails,
    CollectedTrustProviderIdentity,
    TrustProvider,
    TrustProviderKind,
)
from .types import JsonObject, JsonPrimitive, JsonValue

__all__ = [
    "ApiError",
    "AsyncTrustProvider",
    "AuthError",
    "AuthSession",
    "ConnectionMetadata",
    "CredentialError",
    "CredentialResult",
    "CredentialServerRef",
    "CollectedTrustProviderIdentity",
    "ClientWorkloadDetails",
    "EdgeClient",
    "EdgeClientConfig",
    "EdgeSdkError",
    "GetCredentialInput",
    "GetCredentialOptions",
    "JsonObject",
    "JsonPrimitive",
    "JsonValue",
    "RetryPolicy",
    "TransportError",
    "TrustProvider",
    "TrustProviderError",
    "TrustProviderKind",
]
