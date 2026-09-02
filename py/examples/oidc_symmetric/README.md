# OIDC Trust Provider with Symmetric Keys (HS256) Example

This runnable example demonstrates how to configure and use the Aembit Edge Python SDK with an **OIDC Trust Provider** authenticated via locally-signed symmetric keys (HS256).

By generating a symmetrically signed HS256 JWT locally, you can authenticate a workload and exchange it for target credentials securely against the Aembit Edge API, without needing a live external OIDC provider (such as Okta or Ping Identity).

---

## 1. Aembit Console Configuration

To use this example, configure your Aembit tenant to accept symmetrically signed HS256 JWTs:

### A. Create a Symmetric OIDC Trust Provider
1. Log in to your Aembit Console (e.g. `https://<tenant-id>.aembit.io`).
2. Navigate to **Trust Providers** > **Add Trust Provider** > **OIDC**.
3. Configure the following properties:
   - **Name:** e.g., `OIDC HS256`
   - **Issuer (`iss`):** `https://mock-issuer.com` (or any custom URI)
   - **Audience (`aud`):** `https://aembit.io` (or any custom audience string)
   - **Signature Verification:** Select **Symmetric Key (HS256)**.
   - **Secret:** Enter your symmetric secret as a **Base64-encoded string** (e.g., `bXktc3VwZXItc2VjcmV0LWtleS0xMjM0NTY3ODkwIQ==`). 
     
     *Note:* The Aembit Console's Symmetric Key attestation input **only accepts base64-encoded secrets**.
4. Save the configuration. 

### B. Create a Client Workload
1. Navigate to **Workloads** > **Add Workload** > **Client Workload**.
2. Assign the **OIDC HS256** Trust Provider you created above.
3. Under the **Client Identification** configuration, select **OIDC ID Token** from the dropdown and configure the matching claims:
   - **Claim Name:** `sub`
   - **Operator:** `Equals`
   - **Value:** `test-workload-123`
4. Save the Client Workload.

### C. Create an Access Policy
1. Navigate to **Policies** > **Add Access Policy**.
2. Assign your **Client Workload**, your target **Server Workload** (the database or API you want credentials for), and your **OIDC HS256** Trust Provider (which links the two).
3. **Important:** Ensure the Access Policy is set to **Active**.

---

## 2. Copying your Edge SDK Client ID

Aembit Edge Controller requires a fully qualified Client ID ARN to identify the Trust Provider relation. 

You do **not** need to formulate this manually:
- Open your **OIDC HS256** Trust Provider (or Client Workload configuration) details page in the Aembit Console.
- Locate the **Edge SDK Client ID** field.
- Copy the full ARN string (e.g. `aembit:aembit:<tenant-id>:identity:oidc_id_token:<provider-external-id>`). This will be passed as the `client_id` in your configuration.

---

## 3. Running the Example

Update the `EXAMPLE_CONFIG` parameters in `main.py` with your custom coordinates:

```python
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:oidc_id_token:<provider-external-id>",
    
    "issuer": "https://mock-issuer.com",
    "audience": "https://aembit.io",
    "subject": "test-workload-123",
    
    # The exact Base64 string you entered in the Aembit Console.
    # The SDK automatically base64-decodes this secret to sign the HS256 JWT.
    "symmetric_secret": "your-base64-encoded-symmetric-secret-here",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}
```

Run the example using `uv`:

```bash
uv run examples/oidc_symmetric/main.py
```
