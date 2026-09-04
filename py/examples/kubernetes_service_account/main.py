# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using Kubernetes Service Account Trust Provider in Pods.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in Kubernetes Service Account Trust Provider. In a real Pod,
the provider automatically reads the service account token from the default
location (/var/run/secrets/kubernetes.io/serviceaccount/token) dynamically,
which safely handles token rotation by the Kubernetes control plane.
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
from aembit_edge.trust_providers import KubernetesServiceAccountTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant-id>.ec.aembit.io",
    "client_id": "aembit:aembit:<tenant-id>:identity:kubernetes_service_account:<provider-external-id>",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


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
    # Set up Kubernetes Service Account Trust Provider
    #
    # By default, this queries '/var/run/secrets/kubernetes.io/serviceaccount/token'
    # dynamically. For local testing/non-pod environments, you can override this
    # by passing a static token string or a token-producing callable.
    #
    # Example:
    # trust_provider = KubernetesServiceAccountTrustProvider(token="mock-token")
    trust_provider = KubernetesServiceAccountTrustProvider()

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
    print(f"Retrieving credentials for {host}:{port} using Kubernetes Service Account...")

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
