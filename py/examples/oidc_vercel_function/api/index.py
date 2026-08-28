# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Vercel Serverless Function + Vercel OIDC + Aembit OIDC Trust Provider.

This runnable example demonstrates how to configure a Vercel serverless function
using the standard Python runtime, retrieve the OIDC token from the request headers,
and use the Aembit OIDC Trust Provider to retrieve credentials.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from typing import cast

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
    "print_credential_json": False,
}


class handler(BaseHTTPRequestHandler):
    """Vercel HTTP request handler."""

    def do_GET(self) -> None:
        """Handle GET requests."""
        # Set up Trust Provider with request-scoped OIDC token resolver
        # We pass the HTTP handler self to lazily resolve the token from request headers.
        trust_provider = OidcIdTokenTrustProvider(
            identity_token=lambda: self.resolve_oidc_identity_token()
        )

        client = EdgeClient(
            EdgeClientConfig(
                base_url=EXAMPLE_CONFIG["base_url"],
                client_id=EXAMPLE_CONFIG["client_id"],
                trust_provider=trust_provider,
                resource_set=EXAMPLE_CONFIG["resource_set"],
            )
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
            self.send_error_response(500, {"error": str(e)})
            return

        base_response = {
            "authenticated": True,
            "trustProviderId": trust_provider.id,
            "credentialType": credential.credential_type,
            "credentialExpiresAt": credential.expires_at,
        }

        if EXAMPLE_CONFIG["print_credential_json"]:
            api_key_payload = cast(ApiKeyData, credential.data)
            self.send_success_response({
                **base_response,
                "credential": {
                    "credentialType": credential.credential_type,
                    "expiresAt": credential.expires_at,
                    "data": api_key_payload,
                }
            })
            return

        self.send_success_response({
            **base_response,
            "dataKeys": list(credential.data.keys()),
        })

    def resolve_oidc_identity_token(self) -> str:
        """Resolve the OIDC token from Vercel request headers or env."""
        # Vercel injects the OIDC token in the "x-vercel-oidc-token" header in production
        header_token = self.headers.get("x-vercel-oidc-token", "").strip()
        if header_token:
            return header_token

        # Fallback to local environment variable for development
        env_token = os.environ.get("VERCEL_OIDC_TOKEN", "").strip()
        if env_token:
            return env_token

        raise TrustProviderError(
            "Missing Vercel OIDC token. Use the x-vercel-oidc-token request header in production "
            "or set VERCEL_OIDC_TOKEN for local development.",
            retryable=False,
        )

    def send_success_response(self, data: dict[str, any]) -> None:
        """Format and return a 200 OK JSON response."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode("utf-8"))

    def send_error_response(self, code: int, error_data: dict[str, any]) -> None:
        """Format and return an error JSON response."""
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(error_data, indent=2).encode("utf-8"))
