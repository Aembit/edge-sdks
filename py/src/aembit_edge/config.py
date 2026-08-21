# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public client configuration types."""

from dataclasses import dataclass

from .retry import RetryPolicy
from .trust_providers import ClientWorkloadDetails, TrustProvider


@dataclass(slots=True, kw_only=True)
class EdgeClientConfig:
    """Public configuration contract for the sync client."""

    base_url: str
    client_id: str
    trust_provider: TrustProvider
    client_workload_details: ClientWorkloadDetails | None = None
    resource_set: str | None = None
    timeout_ms: int | None = None
    auth_expiry_skew_ms: int | None = None
    retry: RetryPolicy | None = None
