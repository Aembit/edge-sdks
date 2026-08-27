# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using AWS Role Trust Provider with AWS Lambda or ECS.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in AWS Role Trust Provider, retrieve target credentials,
and cast the returned credential data to the `ApiKeyData` type helper for autocompletion.
"""

import os
import sys
from typing import cast

from aembit_edge import (
    ApiKeyData,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.trust_providers import AwsRoleTrustProvider

# 1. Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<region>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def resolve_aws_region() -> str:
    """Resolve AWS region from environment variables."""
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if not region:
        raise ValueError(
            "Missing AWS region. Please set AWS_REGION or AWS_DEFAULT_REGION environment variable."
        )
    return region


def resolve_client_workload_details() -> dict[str, dict[str, dict[str, str]]] | None:
    """Construct optional client workload details for metadata mapping."""
    client_workload_id = os.environ.get("CLIENT_WORKLOAD_ID", "").strip()
    if not client_workload_id:
        return None

    return {
        "os": {
            "environment": {
                "CLIENT_WORKLOAD_ID": client_workload_id,
            }
        }
    }


def main() -> None:
    # 2. Set up AWS Role Trust Provider
    # Reuses local IAM execution credentials automatically via boto3 to sign STS requests
    try:
        region = resolve_aws_region()
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        print("For testing, please export AWS_REGION=us-east-1 first.", file=sys.stderr)
        sys.exit(1)

    trust_provider = AwsRoleTrustProvider(region=region)

    client_workload_details = resolve_client_workload_details()

    # 3. Create EdgeClient instance
    client = EdgeClient(
        EdgeClientConfig(
            base_url=EXAMPLE_CONFIG["base_url"],
            client_id=EXAMPLE_CONFIG["client_id"],
            trust_provider=trust_provider,
            client_workload_details=client_workload_details,
            resource_set=EXAMPLE_CONFIG["resource_set"],
        )
    )

    host = EXAMPLE_CONFIG["server_host"]
    port = EXAMPLE_CONFIG["server_port"]
    print(f"Retrieving credentials for {host}:{port}...")

    # 4. Request credential from Aembit Edge
    credential_input = GetCredentialInput(
        server=CredentialServerRef(
            host=EXAMPLE_CONFIG["server_host"],
            port=EXAMPLE_CONFIG["server_port"],
        )
    )

    options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

    try:
        result = client.get_credential(credential_input, options)
    except Exception as e:
        print(f"Error getting credential from Aembit: {e}", file=sys.stderr)
        sys.exit(1)

    print("Credential retrieved successfully!")

    # 5. Type-safe casting of the credential payload
    # This provides full autocompletion and IDE support for ApiKeyData fields!
    api_key_payload = cast(ApiKeyData, result.data)

    base_response = {
        "authenticated": True,
        "trust_provider_id": trust_provider.id,
        "credential_type": result.credential_type,
        "expires_at": result.expires_at,
    }

    if EXAMPLE_CONFIG["print_credential_json"]:
        print("\n--- Credential Details ---")
        print(f"Type: {result.credential_type}")
        print(f"Expires At: {result.expires_at}")
        # Securely access typed field with full IDE assistance
        print(f"API Key: {api_key_payload.get('apiKey')}")
    else:
        print("\n--- Summary (Secure Mode) ---")
        print(f"Authenticated: {base_response['authenticated']}")
        print(f"Payload Keys: {list(result.data.keys())}")
        print("Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.")


if __name__ == "__main__":
    main()
