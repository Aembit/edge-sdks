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
from aembit_edge.errors import EdgeSdkError
from aembit_edge.trust_providers import KubernetesServiceAccountTrustProvider

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


def resolve_k8s_token() -> str | None:
    """Resolve static Kubernetes service account token from the environment."""
    return (
        os.environ.get("AEMBIT_K8S_SERVICE_ACCOUNT_TOKEN", "").strip()
        or os.environ.get("K8S_SERVICE_ACCOUNT_TOKEN", "").strip()
        or None
    )


def resolve_k8s_token_path() -> str | None:
    """Resolve custom token file path from the environment."""
    return os.environ.get("K8S_TOKEN_PATH", "").strip() or None


def main() -> None:
    # Set up Kubernetes Service Account Trust Provider
    token = resolve_k8s_token()
    token_path = resolve_k8s_token_path()

    trust_provider = KubernetesServiceAccountTrustProvider(
        token=token,
        token_path=token_path,
    )

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
