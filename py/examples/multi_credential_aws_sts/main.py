# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Multi-Credential Provider (Multi-CP) Selection with AWS STS Federation.

This example requires an Aembit Access Policy configured with MULTIPLE Credential Providers
(specifically, multiple AWS STS Federation Credential Providers).

In a Multi-CP Access Policy, each AWS STS Federation Credential Provider is configured with a unique
placeholder "Access Key ID" selector (for example, `AKIADUMMYFORROLEA` for S3 access, and
`AKIADUMMYFORROLEB` for DynamoDB access).

When requesting credentials, the SDK passes `connection_metadata={"accessKeyId": "..."}`
to select which Credential Provider Aembit should use. Aembit matches the selector,
assumes the corresponding IAM role, and returns temporary AWS credentials
(awsAccessKeyId, awsSecretAccessKey, awsSessionToken).

Note: This example uses the Kubernetes Service Account Trust Provider to authenticate the
workload, but the multi-CP selector mechanism works with any Trust Provider.
"""

from __future__ import annotations

import os
import sys
from typing import cast

from aembit_edge import (
    AwsStsData,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.trust_providers import KubernetesServiceAccountTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": (
        "aembit:aembit:<tenant-id>:identity:kubernetes_service_account:<provider-external-id>"
    ),
    # Target Server Workload coordinates (e.g., target.example.com:443 or an AWS service endpoint)
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "AwsStsFederation",
    # AWS STS Federation Access Key ID selector identifying the specific Credential Provider
    "access_key_id_selector": "AKIADUMMYFORROLEA",
    "resource_set": None,
    "print_credential_json": False,
}


def main() -> None:
    # Set up Kubernetes Service Account Trust Provider
    #
    # By default, this queries '/var/run/secrets/kubernetes.io/serviceaccount/token'
    # dynamically. For local testing/non-pod environments, you can override this
    # by setting the AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN environment variable.
    test_token = os.environ.get("AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN")
    trust_provider = (
        KubernetesServiceAccountTrustProvider(token=test_token)
        if test_token
        else KubernetesServiceAccountTrustProvider()
    )

    # Initialize the EdgeClient
    client = EdgeClient(
        EdgeClientConfig(
            base_url=EXAMPLE_CONFIG["base_url"],
            client_id=EXAMPLE_CONFIG["client_id"],
            trust_provider=trust_provider,
            resource_set=EXAMPLE_CONFIG["resource_set"],
        )
    )

    host = str(EXAMPLE_CONFIG["server_host"])
    port = int(EXAMPLE_CONFIG["server_port"])
    print(
        f"Retrieving AWS STS Federation credentials for {host}:{port} using "
        f"selector '{EXAMPLE_CONFIG['access_key_id_selector']}'..."
    )

    # Formulate request input for target credentials with multi-credential selector
    credential_input = GetCredentialInput(
        server=CredentialServerRef(
            host=host,
            port=port,
        ),
        credential_type=str(EXAMPLE_CONFIG["credential_type"]),
        connection_metadata={"accessKeyId": str(EXAMPLE_CONFIG["access_key_id_selector"])},
    )

    options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

    try:
        result = client.get_credential(credential_input, options)
    except Exception as e:
        print(f"Error getting credential from Aembit: {e}", file=sys.stderr)
        sys.exit(1)

    print("AWS STS Federation credential retrieved successfully!")
    print(f"Credential Type: {result.credential_type}")
    print(f"Expires At: {result.expires_at}")

    if EXAMPLE_CONFIG["print_credential_json"]:
        print(f"Data: {result.data}")
    else:
        # Cast to AwsStsData TypedDict for type-safe field access
        sts_data = cast(AwsStsData, result.data)
        access_key_id = sts_data.get("awsAccessKeyId", "")
        masked_key = (
            access_key_id[:4] + "..." + access_key_id[-4:]
            if len(access_key_id) > 8
            else access_key_id
        )
        print(f"Returned AWS Access Key ID: {masked_key}")
        print(f"Returned Data Keys: {list(result.data.keys())}")


if __name__ == "__main__":
    main()
