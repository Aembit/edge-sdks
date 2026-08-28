# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Azure Functions + Azure managed identity + Aembit OIDC Trust Provider.

This runnable example demonstrates how to configure an HTTP trigger Azure Function
using the Python v2 programming model, retrieve an Entra ID token using ManagedIdentityCredential,
and use the Aembit OIDC Trust Provider to retrieve credentials.
"""

import logging
import os
from typing import Any, cast

import azure.functions as func

from aembit_edge import (
    ApiKeyData,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.errors import TrustProviderError
from aembit_edge.trust_providers import OidcIdTokenTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit configuration.
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant>.ec.<region>.aembit.io",
    "client_id": "your-edge-sdk-client-id",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "entra_audience": "api://your-aembit-tenant-app-id-uri",
    "managed_identity_client_id": None,
    "print_credential_json": False,
}

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.route(route="aembitAzureEntraOidc", methods=["GET"])
def aembit_azure_entra_oidc(req: func.HttpRequest) -> func.HttpResponse:
    """HTTP trigger entry point for Azure Functions."""
    if req.method != "GET":
        return func.HttpResponse(
            body=json_response({"error": "Method Not Allowed"}),
            status_code=405,
            mimetype="application/json",
            headers={"Cache-Control": "no-store"},
        )

    logging.info("Processing Aembit Azure Entra OIDC credential request...")

    try:
        trust_provider = create_trust_provider()
        client = create_client(trust_provider)

        credential_input = GetCredentialInput(
            server=CredentialServerRef(
                host=EXAMPLE_CONFIG["server_host"],
                port=EXAMPLE_CONFIG["server_port"],
            )
        )
        options = GetCredentialOptions(resource_set=EXAMPLE_CONFIG["resource_set"])

        credential = client.get_credential(credential_input, options)
    except Exception as e:
        logging.error(f"Error resolving Aembit credential: {e}")
        return func.HttpResponse(
            body=json_response({"error": str(e)}),
            status_code=500,
            mimetype="application/json",
            headers={"Cache-Control": "no-store"},
        )

    base_response = {
        "authenticated": True,
        "trustProviderId": trust_provider.id,
        "credentialType": credential.credential_type,
        "credentialExpiresAt": credential.expires_at,
    }

    if EXAMPLE_CONFIG["print_credential_json"]:
        api_key_payload = cast(ApiKeyData, credential.data)
        return func.HttpResponse(
            body=json_response(
                {
                    **base_response,
                    "credential": {
                        "credentialType": credential.credential_type,
                        "expiresAt": credential.expires_at,
                        "data": api_key_payload,
                    },
                }
            ),
            status_code=200,
            mimetype="application/json",
            headers={"Cache-Control": "no-store"},
        )

    return func.HttpResponse(
        body=json_response(
            {
                **base_response,
                "dataKeys": list(credential.data.keys()),
            }
        ),
        status_code=200,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


def create_trust_provider() -> OidcIdTokenTrustProvider:
    """Create the OIDC ID Token Trust Provider with lazy token resolver."""
    return OidcIdTokenTrustProvider(identity_token=resolve_azure_entra_token)


def create_client(trust_provider: OidcIdTokenTrustProvider) -> EdgeClient:
    """Create the EdgeClient instance."""
    return EdgeClient(
        EdgeClientConfig(
            base_url=EXAMPLE_CONFIG["base_url"],
            client_id=EXAMPLE_CONFIG["client_id"],
            trust_provider=trust_provider,
            resource_set=EXAMPLE_CONFIG["resource_set"],
        )
    )


def resolve_azure_entra_token() -> str:
    """Resolve the Entra managed identity token."""
    env_token = os.environ.get("AZURE_ENTRA_ACCESS_TOKEN", "").strip()
    if env_token:
        logging.info("Using AZURE_ENTRA_ACCESS_TOKEN from environment")
        return env_token

    scope = normalize_entra_scope(EXAMPLE_CONFIG["entra_audience"])
    logging.info(f"Requesting managed identity token for scope {scope}")

    try:
        from azure.identity import ManagedIdentityCredential
    except ImportError as e:
        raise TrustProviderError(
            "Azure managed identity libraries are unavailable. "
            "Set AZURE_ENTRA_ACCESS_TOKEN for local testing or install azure-identity.",
            retryable=False,
        ) from e

    try:
        client_id_val = EXAMPLE_CONFIG["managed_identity_client_id"]
        credential = ManagedIdentityCredential(client_id=client_id_val)
        token_obj = credential.get_token(scope)
        token = token_obj.token.strip() if token_obj and token_obj.token else ""
    except Exception as error:
        logging.error(f"Azure managed identity token request failed: {error}")
        raise TrustProviderError(
            f"Azure managed identity token request failed: {error}",
            retryable=False,
        ) from error

    if not token:
        raise TrustProviderError(
            "Azure managed identity returned an empty Entra access token",
            retryable=False,
        )

    logging.info("Azure managed identity token request succeeded")
    return token


def normalize_entra_scope(audience: str) -> str:
    """Normalize the Entra audience into a valid scope string."""
    trimmed = audience.strip().rstrip("/")
    if not trimmed:
        raise TrustProviderError(
            "Azure Functions example requires entra_audience config",
            retryable=False,
        )

    return trimmed if trimmed.endswith("/.default") else f"{trimmed}/.default"


def json_response(data: dict[str, Any]) -> str:
    """Format dictionary cleanly as a JSON string."""
    import json

    return json.dumps(data, indent=2)
