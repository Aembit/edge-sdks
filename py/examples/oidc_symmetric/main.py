# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: OIDC ID Token Trust Provider using Symmetric Keys (HS256).

This runnable example demonstrates how to sign a JSON Web Token (JWT) locally
using a symmetric key (HS256) and use it with the built-in OidcIdTokenTrustProvider
to authenticate and retrieve credentials against the Aembit Edge Controller.
"""

import base64
import hashlib
import hmac
import json
import sys
import time
from typing import cast

from aembit_edge import (
    ApiKeyData,
    CredentialServerRef,
    EdgeClient,
    EdgeClientConfig,
    GetCredentialInput,
    GetCredentialOptions,
)
from aembit_edge.trust_providers import OidcIdTokenTrustProvider

# Configuration
# Edit these placeholder values to match your specific Aembit and OIDC configurations.
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:oidc_id_token:<provider-external-id>",
    
    "issuer": "https://mock-issuer.com",
    "audience": "https://aembit.io",
    "subject": "test-workload-123",
    
    # The symmetric key entered in the Aembit Console (must be base64-encoded as required by Aembit)
    "symmetric_secret": "your-base64-encoded-symmetric-secret-here",
    
    # Target Server Workload coordinates that the Client Workload has access to via your Access Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}


def base64url_encode(data: bytes) -> str:
    """Encode bytes into base64url format, stripping trailing padding."""
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def generate_hs256_jwt(secret: str, issuer: str, audience: str, subject: str) -> str:
    """Generate a short-lived symmetrically signed HS256 JWT using standard libraries."""
    header = {"alg": "HS256", "typ": "JWT"}

    now = int(time.time())
    payload = {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "iat": now,
        "nbf": now - 30,
        "exp": now + 600,  # Valid for 10 minutes
    }

    header_b64 = base64url_encode(json.dumps(header).encode("utf-8"))
    payload_b64 = base64url_encode(json.dumps(payload).encode("utf-8"))

    signing_input = f"{header_b64}.{payload_b64}".encode()

    # Base64-decode the secret to raw bytes (Aembit console only accepts base64-encoded symmetric keys)
    try:
        key_bytes = base64.b64decode(secret)
    except Exception as e:
        raise ValueError(f"Symmetric secret must be a valid base64-encoded string: {e}")

    # Generate HMAC-SHA256 signature
    signature = hmac.new(key_bytes, signing_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def main() -> None:
    print("Generating symmetrically signed OIDC ID Token (HS256)...")
    try:
        id_token = generate_hs256_jwt(
            secret=EXAMPLE_CONFIG["symmetric_secret"],
            issuer=EXAMPLE_CONFIG["issuer"],
            audience=EXAMPLE_CONFIG["audience"],
            subject=EXAMPLE_CONFIG["subject"],
        )
    except Exception as e:
        print(f"Error generating token: {e}", file=sys.stderr)
        sys.exit(1)

    # Instantiate the OidcIdTokenTrustProvider with the generated JWT
    trust_provider = OidcIdTokenTrustProvider(identity_token=id_token)

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
    print(f"Retrieving credentials for {host}:{port} using Symmetric OIDC Trust Provider...")

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
