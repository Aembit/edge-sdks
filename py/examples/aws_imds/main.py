# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using AWS Metadata Service (IMDS) Trust Provider with EC2.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in AWS Metadata Service (IMDS) Trust Provider, retrieve target credentials,
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
from aembit_edge.trust_providers import AwsMetadataServiceTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://d6b705.ec.devbroadangle.aembit-eng.com",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:devbroadangle:d6b705:identity:aws_metadata:fe576526-0b85-4d7a-8e9a-80313da81d41",
    
    "server_host": "d6b705.api.devbroadangle.aembit-eng.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def resolve_client_workload_details() -> dict[str, dict[str, dict[str, str]]] | None:
    """Construct client workload details for metadata mapping."""
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
    # Set up AWS Metadata Service (IMDS) Trust Provider
    # Queries the EC2 Instance Metadata Service (IMDSv2)
    trust_provider = AwsMetadataServiceTrustProvider()

    client_workload_details = resolve_client_workload_details()

    # Create EdgeClient instance
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

    # Request credential from Aembit Edge
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

    # Type-safe casting of the credential payload
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
