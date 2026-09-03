# AWS Instance Metadata Service (IMDS) Trust Provider Example

This runnable example demonstrates how to configure and use the Aembit Edge Python SDK with the built-in **AWS Instance Metadata Service (IMDS) Trust Provider** on an AWS EC2 instance.

---

## How it Works

Every AWS EC2 instance has access to a local Instance Metadata Service (IMDS) at a link-local IP address (`http://169.254.169.254`). AWS uses this service to expose details about the VM's active identity, including its cryptographically signed **Instance Identity Document (IID)**.

The `AwsMetadataServiceTrustProvider` automatically:
1. Contacts your local EC2 IMDSv2 endpoint to fetch your VM's cryptographically signed Instance Identity Document (IID).
2. Packages this signed document as proof of identity to submit to the Aembit Edge API.
3. Aembit then validates the signature against AWS's public keys to securely verify your VM's identity (Account ID, Instance ID, Region, AMI ID, etc.).

---

## Recommended AWS EC2 Testing Environment

---

## 1. Retrieving the AWS Public Certificate

Aembit requires the official AWS Public Certificate for your specific EC2 region to cryptographically verify your VM's identity. 

The easiest and most accurate way to get this certificate is to copy it directly from https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/regions-certs.html for your target region.

---

## 2. Aembit Console Configuration

To use this example, configure your Aembit tenant to trust your AWS EC2 instance:

### A. Create an AWS Instance Metadata Trust Provider
1. Log in to your Aembit Console (e.g. `https://<tenant-id>.aembit.io`).
2. Navigate to **Trust Providers** > **New** > **AWS Metadata Service**.
3. **Certificate:** Paste the contents of the cert you grabbed in Step 1.
3. Configure the following properties:
   - **Name:** e.g., `AWS IMDS TP`
   - **Match Rules:** Add at least one Match Rule (at least one is required). Select from the dropdown:
     - **`accountId`**: e.g., `123456789012` (matches the AWS Account ID).
4. Save the configuration.

### B. Create a Client Workload
1. Navigate to **Client Workloads** > **New**.
2. Under the **Client Identification** configuration, select **AWS Account ID** from the dropdown and paste your AWS Account ID (e.g., `123456789012`).
3. Save the Client Workload.

### C. Create an Access Policy
1. Navigate to **Access Policies** > **New**.
2. Attach your **Client Workload**, your target **Server Workload**, your **Trust Provider**, your desired **Credential Provider**
3. **Important:** Once everything is in place, ensure the Access Policy is set to **Active**.

---

## 3. Running the Example on your EC2 Instance

SSH into your running EC2 instance and execute the following steps to run the test:

### A. Install Python and Git
On Amazon Linux 2023:
```bash
sudo dnf update -y
sudo dnf install -y python3-pip git
```

### B. Download and Configure the Example
Clone your repository or copy the `examples/aws_imds` files onto the machine, then edit `main.py`'s `EXAMPLE_CONFIG`:

```python
EXAMPLE_CONFIG = {
    # The Aembit Edge Controller base URL (e.g., https://<tenant-id>.ec.aembit.io)
    "base_url": "https://<tenant-id>.ec.aembit.io",
    
    # Copied in full from the 'Edge SDK Client ID' field of your Trust Provider in the Console
    "client_id": "aembit:aembit:<tenant-id>:identity:aws_metadata:<provider-external-id>",
    
    # Target Server Workload coordinates that your Client Workload has access to via your Active Policy
    "server_host": "target.example.com",
    "server_port": 443,
    "credential_type": "ApiKey",
    "resource_set": None,
    "print_credential_json": False,
}
```

### C. Run the Example using `uv`
Install `uv` and run the script:

```bash
# Install uv locally
curl -LsSf https://astral.sh/uv/install.sh | sh

Copy your configured examples/aws_imds/main.py to the ec2 instance

# Execute the example
uv run --python 3.11 main.py
```
