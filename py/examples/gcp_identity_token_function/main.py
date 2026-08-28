# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: GCP Cloud Function + GCP identity token + Aembit GCP Trust Provider.

This runnable example demonstrates how to configure an HTTP Google Cloud Function
using functions-framework, fetch a GCP identity token from the Google metadata server,
and use the Aembit GCP Identity Token Trust Provider to retrieve credentials.
"""

import os
import urllib.request
from typing import Any, cast

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<region>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "gcp_identity_token_audience": "https://<tenant>.id.<region>.aembit.io",
    "print_credential_json": False,
}

GCP_METADATA_IDENTITY_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity"
)

# Initialize EdgeClient lazily or on module load.
# We'll import lazily inside the handler if needed, or import at top-level.
try:
    from aembit_edge import (
        ApiKeyData,
        CredentialServerRef,
        EdgeClient,
        EdgeClientConfig,
        GetCredentialInput,
        GetCredentialOptions,
    )
    from aembit_edge.errors import TrustProviderError
    from aembit_edge.trust_providers import GcpIdentityTokenTrustProvider

    trust_provider = GcpIdentityTokenTrustProvider(
        identity_token=lambda: resolve_gcp_identity_token()
    )

    client = EdgeClient(
        EdgeClientConfig(
            base_url=EXAMPLE_CONFIG["base_url"],
            client_id=EXAMPLE_CONFIG["client_id"],
            trust_provider=trust_provider,
            resource_set=EXAMPLE_CONFIG["resource_set"],
        )
    )
except ImportError:
    # Allow file to load for lint/type checking even if aembit_edge is not installed
    pass


def aembitGcpIdentityToken(request: Any) -> Any:
    """HTTP trigger entry point for GCP Cloud Functions."""
    # Handle CORS or request filtering if needed, similar to TS
    if request.method != "GET":
        return (
            json_response({"error": "Method Not Allowed"}),
            405,
            {"Content-Type": "application/json", "Cache-Control": "no-store"},
        )

    try:
        credential_input = GetCredentialInput(
            server=CredentialServerRef(
                host=EXAMPLE_CONFIG["server_host"],
                port=EXAMPLE_CONFIG["server_port"],
            )
        )
        options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

        credential = client.get_credential(credential_input, options)
    except Exception as e:
        return (
            json_response({"error": str(e)}),
            500,
            {"Content-Type": "application/json", "Cache-Control": "no-store"},
        )

    base_response = {
        "authenticated": True,
        "trustProviderId": trust_provider.id,
        "credentialType": credential.credential_type,
        "credentialExpiresAt": credential.expires_at,
    }

    if EXAMPLE_CONFIG["print_credential_json"]:
        api_key_payload = cast(ApiKeyData, credential.data)
        return (
            json_response(
                {
                    **base_response,
                    "credential": {
                        "credentialType": credential.credential_type,
                        "expiresAt": credential.expires_at,
                        "data": api_key_payload,
                    },
                }
            ),
            200,
            {"Content-Type": "application/json", "Cache-Control": "no-store"},
        )

    return (
        json_response(
            {
                **base_response,
                "dataKeys": list(credential.data.keys()),
            }
        ),
        200,
        {"Content-Type": "application/json", "Cache-Control": "no-store"},
    )


def resolve_gcp_identity_token() -> str:
    """Fetch identity token from GCP metadata server or env."""
    env_token = os.environ.get("GCP_IDENTITY_TOKEN", "").strip()
    if env_token:
        return env_token

    url = f"{GCP_METADATA_IDENTITY_URL}?audience={EXAMPLE_CONFIG['gcp_identity_token_audience']}"
    req = urllib.request.Request(
        url,
        headers={"Metadata-Flavor": "Google"},
    )

    try:
        with urllib.request.urlopen(req, timeout=2.0) as response:
            identity_token = response.read().decode("utf-8").strip()
    except Exception as e:
        raise TrustProviderError(
            f"GCP metadata server request for identity token failed: {e}",
            retryable=True,
        ) from e

    if not identity_token:
        raise TrustProviderError(
            "GCP metadata server returned an empty identity token",
            retryable=False,
        )

    return identity_token


def json_response(data: dict[str, Any]) -> str:
    """Format dictionary cleanly as a JSON string."""
    import json

    return json.dumps(data, indent=2)


# Try to register the handler with functions-framework if available
try:
    import functions_framework

    functions_framework.http(aembitGcpIdentityToken)
except ImportError:
    pass
