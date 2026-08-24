# Copyright 2024-present Aembit, Inc.
# SPDX-License-Identifier: Apache-2.0
"""Example: Intercepting Aembit Edge SDK standard logging into Loguru.

This example illustrates how applications using Loguru can intercept standard
library logging records emitted by 'aembit_edge' and format them through
Loguru's structured log engine.
"""

import inspect
import logging

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


class LoguruInterceptHandler(logging.Handler):
    """Intercept standard logging records and redirect them to Loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            import loguru  # type: ignore[import-not-found]
        except ImportError:
            # Fallback formatting if loguru is not installed in the environment
            print(f"[FALLBACK LOGURU SIMULATOR] [{record.levelname}] {record.getMessage()}")
            return

        # Find caller from where originated the logged message
        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        level = record.levelname
        loguru.logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def main() -> None:
    # 1. Attach InterceptHandler to 'aembit_edge' logger
    sdk_logger = logging.getLogger("aembit_edge")
    sdk_logger.setLevel(logging.DEBUG)
    sdk_logger.handlers = [LoguruInterceptHandler()]

    print("--- Initializing EdgeClient with Loguru InterceptHandler ---")

    # 2. Initialize EdgeClient
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
