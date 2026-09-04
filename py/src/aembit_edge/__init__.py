# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public package exports for the Aembit Edge Python SDK."""

import logging

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
from .types import (
    ApiKeyData,
    AwsStsData,
    JsonObject,
    JsonPrimitive,
    JsonValue,
    UsernamePasswordData,
)

# Ensure named logger has a NullHandler to avoid "No handler found" warnings
# when host application has not configured logging.
_logger = logging.getLogger("aembit_edge")
if not _logger.handlers:
    _logger.addHandler(logging.NullHandler())

__all__ = [
    "ApiKeyData",
    "ApiError",
    "AsyncTrustProvider",
    "AuthError",
    "AuthSession",
    "AwsStsData",
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
    "UsernamePasswordData",
]
