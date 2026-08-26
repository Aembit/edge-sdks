# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Using Python standard library logging with Aembit Edge SDK.

By default, the SDK remains completely silent and attaches a NullHandler.
This example demonstrates how host applications can configure the 'aembit_edge'
named logger to capture debug or info events with custom formatting.
"""

import logging
import sys

from aembit_edge import (
    CollectedTrustProviderIdentity,
    EdgeClient,
    EdgeClientConfig,
)


class ExampleTrustProvider:
    """Mock Trust Provider for local runnable demonstration."""

    id = "example-provider"

    def collect_identity(self) -> CollectedTrustProviderIdentity:
        return CollectedTrustProviderIdentity(
            client={"custom": {"workloadId": "worker-1"}},
            auth_cache_key="example-worker-1",
        )


def main() -> None:
    # Configure standard logging for the 'aembit_edge' namespace
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    sdk_logger = logging.getLogger("aembit_edge")
    sdk_logger.setLevel(logging.DEBUG)
    sdk_logger.addHandler(handler)

    print("--- Initializing EdgeClient with standard logging enabled ---")

    # Initialize EdgeClient
    client = EdgeClient(
        EdgeClientConfig(
            base_url="https://tenant.aembit.io",
            client_id="demo-client-id",
            trust_provider=ExampleTrustProvider(),  # type: ignore[arg-type]
        )
    )
    print(f"EdgeClient created successfully for client_id='{client.config.client_id}'")

    print("\n--- Example completed successfully ---")


if __name__ == "__main__":
    main()
