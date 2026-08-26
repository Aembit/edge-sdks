# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public Trust Provider exports."""

from .aws_metadata_service import AwsMetadataServiceTrustProvider
from .aws_role import AwsRoleTrustProvider
from .base import (
    AsyncTrustProvider,
    ClientWorkloadDetails,
    CollectedTrustProviderIdentity,
    TrustProvider,
    TrustProviderKind,
)
from .oidc_providers import (
    GitHubTrustProvider,
    GitLabTrustProvider,
    TerraformTrustProvider,
)

__all__ = [
    "AsyncTrustProvider",
    "AwsMetadataServiceTrustProvider",
    "AwsRoleTrustProvider",
    "ClientWorkloadDetails",
    "CollectedTrustProviderIdentity",
    "GitHubTrustProvider",
    "GitLabTrustProvider",
    "TerraformTrustProvider",
    "TrustProvider",
    "TrustProviderKind",
]
