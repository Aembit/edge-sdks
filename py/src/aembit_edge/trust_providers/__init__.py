# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Public Trust Provider exports."""

from .aws_metadata_service import AwsMetadataServiceTrustProvider
from .aws_role import AwsRoleTrustProvider
from .azure_metadata_service import AzureMetadataServiceTrustProvider
from .base import (
    AsyncTrustProvider,
    ClientWorkloadDetails,
    CollectedTrustProviderIdentity,
    TrustProvider,
    TrustProviderKind,
)
from .gcp_identity_token import GcpIdentityTokenTrustProvider
from .oidc_id_token import OidcIdTokenTrustProvider
from .oidc_providers import (
    GitHubTrustProvider,
    GitLabTrustProvider,
    TerraformTrustProvider,
)

__all__ = [
    "AsyncTrustProvider",
    "AwsMetadataServiceTrustProvider",
    "AwsRoleTrustProvider",
    "AzureMetadataServiceTrustProvider",
    "ClientWorkloadDetails",
    "CollectedTrustProviderIdentity",
    "GcpIdentityTokenTrustProvider",
    "GitHubTrustProvider",
    "GitLabTrustProvider",
    "OidcIdTokenTrustProvider",
    "TerraformTrustProvider",
    "TrustProvider",
    "TrustProviderKind",
]
