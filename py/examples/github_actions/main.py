# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using GitHub Action Trust Provider in GitHub Workflows.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in GitHub Action Trust Provider, fetch an OIDC token dynamically
from GitHub's metadata server inside a runner, and retrieve target credentials.
"""

import json
import os
import sys
import urllib.request
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
from aembit_edge.trust_providers import GitHubTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<stack>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    "aembit_identity_audience": "https://<tenant>.id.<stack>.aembit.io",
    # Target Server Workload coordinates that your Client Workload has access to
    # via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def resolve_github_identity_token() -> str:
    """Fetch GitHub OIDC token from environment or dynamically from GitHub metadata server."""
    # 1. Check if token is pre-provided in the environment (common for testing)
    for env_var in ["GITHUB_IDENTITY_TOKEN", "DEV_OIDC_TOKEN"]:
        token = os.environ.get(env_var, "").strip()
        if token:
            print(f"Using pre-configured token from environment variable: {env_var}")
            return token

    # 2. Check if running inside GitHub Actions with OIDC permission enabled
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")

    if not request_token or not request_url:
        raise TrustProviderError(
            "GitHub OIDC token could not be resolved.\n"
            "If running locally, set GITHUB_IDENTITY_TOKEN.\n"
            "If running in GitHub Actions, ensure you have set:\n"
            "permissions:\n  id-token: write",
            retryable=False,
        )

    # 3. Fetch OIDC token dynamically from GitHub Actions' Runtime metadata endpoint
    audience = EXAMPLE_CONFIG["aembit_identity_audience"]
    url = f"{request_url}&audience={audience}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"bearer {request_token}"},
    )

    print("Fetching dynamic OIDC identity token from GitHub Actions metadata server...")
    try:
        with urllib.request.urlopen(req, timeout=5.0) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            identity_token = res_data.get("value", "").strip()
    except Exception as e:
        raise TrustProviderError(
            f"GitHub Actions metadata request for identity token failed: {e}",
            retryable=True,
        ) from e

    if not identity_token:
        raise TrustProviderError(
            "GitHub Actions metadata server returned an empty identity token response",
            retryable=False,
        )

    return identity_token


def main() -> None:
    try:
        # Resolve GitHub Actions Identity Token
        token = resolve_github_identity_token()
    except Exception as e:
        print(f"Error resolving identity: {e}", file=sys.stderr)
        sys.exit(1)

    # Set up GitHub Action Trust Provider
    trust_provider = GitHubTrustProvider(identity_token=token)

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
