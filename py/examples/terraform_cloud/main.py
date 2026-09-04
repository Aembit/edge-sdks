# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using Terraform Cloud Identity Token Trust Provider.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in Terraform Cloud Trust Provider.
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
from aembit_edge.trust_providers import TerraformTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:terraform_idtoken:<provider-external-id>",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def main() -> None:
    # In Terraform Cloud or Enterprise runs, an identity token is injected
    # into the environment when the step is configured with workload identity.
    # For local testing, we fall back to a mock token or prompt.
    token = os.environ.get("TFC_WORKLOAD_IDENTITY_TOKEN", "mock-tfc-token-for-local-test")

    # Initialize the Terraform Cloud Trust Provider
    trust_provider = TerraformTrustProvider(identity_token=token)

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
    print(f"Retrieving credentials for {host}:{port} using Terraform Cloud Trust Provider...")

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
