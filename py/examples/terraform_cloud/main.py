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
from aembit_edge.errors import EdgeSdkError, TrustProviderError
from aembit_edge.trust_providers import TerraformTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<stack>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    # Target Server Workload coordinates that your Client Workload has access to
    # via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def resolve_terraform_cloud_identity_token() -> str:
    """Resolve the Terraform Cloud identity token from the environment."""
    token = (
        os.environ.get("AEMBIT_TERRAFORM_OIDC_TOKEN", "").strip()
        or os.environ.get("TFC_WORKLOAD_IDENTITY_TOKEN", "").strip()
    )
    if token:
        return token

    raise TrustProviderError(
        "Missing Terraform Cloud identity token. Ensure Dynamic Provider Credentials / "
        "Workload Identity is configured in your Terraform workspace or set "
        "AEMBIT_TERRAFORM_OIDC_TOKEN for local testing.",
        retryable=False,
    )


def main() -> None:
    # Initialize the Terraform Cloud Trust Provider
    trust_provider = TerraformTrustProvider(
        identity_token=lambda: resolve_terraform_cloud_identity_token()
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
