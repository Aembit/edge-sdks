# OIDC Trust Provider (Symmetric HS256) Example (Python)

Runnable OIDC Symmetric example for the Python SDK.

This example demonstrates how to configure and run the Python SDK using locally-signed symmetric keys (HS256) against an OIDC Trust Provider:

- edit a small config block in [`./main.py`](./main.py)
- run the example using `uv`

By generating a symmetrically signed HS256 JWT locally, you can authenticate a workload and exchange it for target credentials securely against the Aembit Edge API, without needing a live external OIDC provider (such as Okta or Ping Identity).

## Prerequisites

- Python `>=3.9` installed
- An Aembit Access Policy configured for this SDK flow

## Aembit Setup

Before running this example, configure an Aembit Access Policy that includes:

- a Client Workload matching your custom OIDC claims (e.g. matching `sub` claim `test-workload-123`)
- a Server Workload with a Service Endpoint (`host`, `port`) that this example will request
- an OIDC Trust Provider (configured with signature verification **Symmetric Key (HS256)** and your Base64 symmetric secret) with an Edge SDK Client ID
- a Credential Provider that returns the requested credential type

References:

- Server Workload guide: <https://docs.aembit.io/user-guide/access-policies/server-workloads/>
- OIDC Trust Provider guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/oidc-trust-provider/>
- OIDC auth setup: <https://docs.aembit.io/api-guide/edge/auth/oidc-id-token>
- Get Edge SDK Client ID guide: <https://docs.aembit.io/user-guide/access-policies/trust-providers/get-edge-sdk-client-id/>

Example Server Workload configuration for this README:

- Name: `Test SDK Server`
- Host: `test.example.com`
- Transport Protocol: `TCP`
- Port: `443`

## Edit The Example

Open [`./main.py`](./main.py) and update `EXAMPLE_CONFIG`:

- `base_url`: your tenant's regional Aembit Edge URL
- `client_id`: your Edge SDK Client ID from the OIDC Trust Provider
- `issuer` and `audience`: must match the issuer (`iss`) and audience (`aud`) configured on your Symmetric OIDC Trust Provider
- `subject`: the subject (`sub`) claim representing your workload (must match Client Workload matching rules)
- `symmetric_secret`: your symmetric secret entered in the Console as a Base64-encoded string
- `server_host` and `server_port`: the Service Endpoint from your Server Workload
- `credential_type`: the credential type returned by your Credential Provider
- `resource_set`: optional, only when your tenant flow requires it
- `print_credential_json`: set to `True` only when you explicitly want the full credential printed

`server_host` and `server_port` must exactly match the Service Endpoint values configured in your Server Workload.

## Run The Example

Run the example locally using `uv`:

```bash
uv run examples/oidc_symmetric/main.py
```

## Output

The script first prints a safe authenticated session summary, then prints credential metadata.

By default, the credential output includes:

- `credential_type`
- `expires_at`
- `data_keys`

If `EXAMPLE_CONFIG.print_credential_json` is `True`, the script prints the full credential payload instead.

Example successful output:

```json
{
  "authenticated": true,
  "expiresAt": "2026-03-10T20:18:09.108Z",
  "trustProviderId": "oidc-symmetric"
}
{
  "credentialType": "ApiKey",
  "expiresAt": "2026-03-10T19:19:09.2559713Z",
  "dataKeys": [
    "apiKey"
  ]
}
```

## Troubleshooting

### `401` on `/credentials` after successful auth

If `authenticate()` succeeds but credential retrieval returns `401`, verify that `base_url` is the final regional Edge host and does not redirect.

Example:

- `https://<tenant>.ec.<stack>.aembit.io`

Redirecting hosts can cause `Authorization` to be dropped on redirect, which results in `401` for `/credentials`.

### `200` with `credentialType: "Unknown"` and empty `dataKeys`

This means the request reached Edge but did not match the expected access policy or service request shape.

Verify:

- `server_host` and `server_port`
- `credential_type`
- Claim matching in your Client Workload (e.g. matching `sub` claim value)
- `resource_set`, if your tenant flow requires it

## Security Note

Do not use real secrets in shared logs or screenshots.
Enable `print_credential_json` only for controlled testing.
The symmetric secret must be protected securely.
