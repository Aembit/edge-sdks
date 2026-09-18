# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
#
# /// script
# dependencies = [
#     "aembit-edge-sdk>=0.1.0",
# ]
# ///
"""Example: Using Azure Metadata Service (IMDS) Trust Provider with Azure VMs.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in Azure Instance Metadata Service (IMDS) Trust Provider, retrieve
target credentials, and print them.
"""

import sys

from aembit_edge import (
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.errors import EdgeSdkError
from aembit_edge.trust_providers import AzureMetadataServiceTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<stack>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def main() -> None:
    # Set up Azure Metadata Service (IMDS) Trust Provider
    # Queries the Azure Instance Metadata Service (IMDS) automatically
    trust_provider = AzureMetadataServiceTrustProvider()

    # Create EdgeClient instance
    client = EdgeClient(
        EdgeClientConfig(
            base_url=EXAMPLE_CONFIG["base_url"],
            client_id=EXAMPLE_CONFIG["client_id"],
            trust_provider=trust_provider,
            resource_set=EXAMPLE_CONFIG["resource_set"],
        )
    )

    host = EXAMPLE_CONFIG["server_host"]
    port = EXAMPLE_CONFIG["server_port"]
    print(f"Retrieving credentials for {host}:{port} using Azure IMDS Trust Provider...")

    # Request credential from Aembit Edge
    credential_input = GetCredentialInput(
        server=CredentialServerRef(
            host=EXAMPLE_CONFIG["server_host"],
            port=EXAMPLE_CONFIG["server_port"],
        ),
        credential_type=EXAMPLE_CONFIG["credential_type"],
    )

    options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

    try:
        result = client.get_credential(credential_input, options)
    except EdgeSdkError as e:
        print(f"Aembit Edge SDK Error: {e}", file=sys.stderr)
        print(f"  Kind: {e.kind}", file=sys.stderr)
        if e.status_code is not None:
            print(f"  Status Code: {e.status_code}", file=sys.stderr)
        if e.api_code is not None:
            print(f"  API Code: {e.api_code}", file=sys.stderr)
        if e.request_id is not None:
            print(f"  Request ID: {e.request_id}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error getting credential from Aembit: {e}", file=sys.stderr)
        sys.exit(1)

    print("Credential retrieved successfully!")

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
        print(f"Token Data: {result.data}")
    else:
        print("\n--- Summary (Secure Mode) ---")
        print(f"Authenticated: {base_response['authenticated']}")
        print(f"Payload Keys: {list(result.data.keys())}")
        print("Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.")


if __name__ == "__main__":
    main()
