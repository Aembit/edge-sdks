# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using AWS Role Trust Provider with AWS Lambda or ECS.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in AWS Role Trust Provider, retrieve credentials for a target
Server Workload, and secure your database or API requests.
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

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:aws_role:<provider-external-id>",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def resolve_aws_region() -> str:
    """Resolve active AWS region from local execution environment."""
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if not region:
        # Default to us-east-1 if no region is exported in the environment
        region = "us-east-1"
    return region.strip()


def main() -> None:
    region = resolve_aws_region()

    # Initialize the AWS Role Trust Provider
    #
    # Under the hood, this provider will automatically find your local AWS execution
    # credentials, sign a secure STS GetCallerIdentity request, and present it as
    # proof of identity to the Aembit Edge Controller.
    trust_provider = AwsRoleTrustProvider(region=region)

    # Initialize the EdgeClient
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
    print(f"Retrieving credentials for {host}:{port} using AWS Role Trust Provider...")

    # Formulate request input for target credentials
    credential_input = GetCredentialInput(
        server=CredentialServerRef(
            host=host,
            port=port,
        )
    )

    options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

    try:
        result = client.get_credential(credential_input, options)
    except Exception as e:
        print(f"Error getting credential from Aembit: {e}", file=sys.stderr)
        sys.exit(1)

    print("Credential retrieved successfully!")

    # Type-safe casting of the credential payload (for IDE completions/assistance)
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
        print(f"API Key: {api_key_payload.get('apiKey')}")
    else:
        print("\n--- Summary (Secure Mode) ---")
        print(f"Authenticated: {base_response['authenticated']}")
        print(f"Payload Keys: {list(result.data.keys())}")
        print("Set EXAMPLE_CONFIG['print_credential_json'] = True to inspect actual credentials.")


if __name__ == "__main__":
    main()
