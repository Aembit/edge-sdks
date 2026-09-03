# Kubernetes Service Account Trust Provider Example

This runnable example demonstrates how to configure and use the Aembit Edge Python SDK with the built-in **Kubernetes Service Account Trust Provider** in a containerized Pod.

## How it Works

In a standard Kubernetes cluster, when a Pod runs with an assigned Service Account, the `kubelet` automatically mounts a signed JSON Web Token (JWT) on the Pod's local file system at `/var/run/secrets/kubernetes.io/serviceaccount/token`.

The `KubernetesServiceAccountTrustProvider` automatically:
1. Locates and dynamically reads the service account token from disk whenever `collect_identity()` is invoked.
2. Trims any leading/trailing whitespace.
3. Automatically adapts to projected token lifetimes and rotation, which is managed dynamically by Kubernetes (the token is rewritten on disk roughly every hour). Reading directly from disk on each identity collection guarantees that expired cached tokens are never sent to the Aembit Edge API.

## 1. Aembit Console Configuration

To use this example, configure your Aembit tenant to trust your Kubernetes Service Account:

### A. Create a Kubernetes Trust Provider
1. Log in to your Aembit Console (e.g. `https://<tenant-id>.aembit.io`).
2. Navigate to **Trust Providers** > **New** > **Kubernetes**.
3. Configure the following properties:
   - **Name:** e.g., `K8s Service Account TP`
   - **Match Rules:** Add at least one Match Rule (at least one is required). Select from the dropdown:
     - **`subject`**: e.g., `system:serviceaccount:default:my-workload-sa` (matches the Kubernetes Service Account Subject).
4. Save the configuration.

### B. Create a Client Workload
1. Navigate to **Client Workloads** > **New**.
2. Under the **Client Identification** configuration, select **Service Account Token Subject** from the dropdown and paste your Kubernetes Service Account Subject (e.g., `system:serviceaccount:default:my-workload-sa`).
3. Save the Client Workload.

### C. Create an Access Policy
1. Navigate to **Access Policies** > **New**.
2. Attach your **Client Workload**, your target **Server Workload**, your **Trust Provider**, and your desired **Credential Provider**.
3. **Important:** Once everything is in place, ensure the Access Policy is set to **Active**.

---

## 2. Configuration

Update the `EXAMPLE_CONFIG` parameters in `main.py` with your Aembit coordinates:

```python
EXAMPLE_CONFIG = {
    "base_url": "https://<tenant-id>.ec.aembit.io",
    "client_id": "aembit:aembit:<tenant-id>:identity:kubernetes_service_account:<provider-external-id>",
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}
```

## Running Locally

Because the example reads from a default file path, running it on a local non-Kubernetes machine will raise a `TrustProviderError` unless you mock the file or provide a local token override.

To run locally with a test token, modify the `main()` instantiation in `main.py`:

```python
# Pass a static test token for local development and testing
trust_provider = KubernetesServiceAccountTrustProvider(token="your-test-token-here")
```

Then run the example using `uv`:

```bash
uv run examples/kubernetes_service_account/main.py
```
