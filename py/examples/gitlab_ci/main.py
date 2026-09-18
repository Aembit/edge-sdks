# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using GitLab Job ID Token Trust Provider in GitLab CI/CD.

This runnable example demonstrates how to configure the Aembit Edge client
with the built-in GitLab Trust Provider, retrieve a GitLab Job OIDC token
from the environment inside a CI/CD job, and retrieve target credentials.
"""

import os
import sys

from aembit_edge import (
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.errors import EdgeSdkError, TrustProviderError
from aembit_edge.trust_providers import GitLabTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
# The SDK automatically defaults to environment variables
# (AEMBIT_BASE_URL, CLIENT_ID, RESOURCE_SET_ID) if they are set
# in your CI/CD environment, matching the TS SDK behavior.
EXAMPLE_CONFIG = {
    # The Aembit Edge API Base URL (e.g., https://<tenant>.ec.<stack>.aembit.io)
    "base_url": os.environ.get("AEMBIT_BASE_URL") or "https://<tenant>.ec.<stack>.aembit.io",
    "client_id": os.environ.get("CLIENT_ID") or "your-edge-sdk-client-id",
    # Optional Resource Set ID if resources are isolated in a custom partition
    "resource_set": os.environ.get("RESOURCE_SET_ID") or None,
    # The name of the environment variable containing your GitLab CI/CD ID Token
    "gitlab_token_env_var": "GITLAB_OIDC_TOKEN",
    # Target Server Workload coordinates that your Client Workload has access to
    # via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "print_credential_json": False,
}


def resolve_gitlab_identity_token() -> str:
    """Fetch GitLab OIDC token from the configured environment variables."""
    # Check both the configured env var and the standard DEV_OIDC_TOKEN for fallback
    for env_var in [EXAMPLE_CONFIG["gitlab_token_env_var"], "DEV_OIDC_TOKEN"]:
        token = os.environ.get(env_var, "").strip()
        if token:
            print(f"Using GitLab OIDC token from environment variable: {env_var}")
            return token

    env_var = EXAMPLE_CONFIG["gitlab_token_env_var"]
    raise TrustProviderError(
        "GitLab OIDC token could not be resolved from environment variable: "
        f"{env_var} or DEV_OIDC_TOKEN.\n"
        "If running locally, set the environment variable manually.\n"
        "If running in GitLab CI/CD, ensure you have declared the 'id_tokens' block "
        "in your .gitlab-ci.yml.",
        retryable=False,
    )


def main() -> None:
    try:
        # Resolve GitLab CI/CD Job Identity Token
        token = resolve_gitlab_identity_token()
    except EdgeSdkError as e:
        print(f"Aembit Edge SDK Error: {e}", file=sys.stderr)
        print(f"  Kind: {e.kind}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error resolving identity: {e}", file=sys.stderr)
        sys.exit(1)

    # Set up GitLab Trust Provider
    trust_provider = GitLabTrustProvider(identity_token=token)

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
    print(f"Retrieving credentials for {host}:{port} using GitLab Trust Provider...")

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
