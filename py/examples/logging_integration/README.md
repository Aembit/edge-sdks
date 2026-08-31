# Logging Integration Example (Python)

This directory demonstrates how host applications configure and intercept logging from the Aembit Edge Python SDK.

## Default Behavior: Completely Silent

By default, the SDK initializes a `logging.NullHandler` on the top-level `aembit_edge` logger:

```python
logging.getLogger("aembit_edge").addHandler(logging.NullHandler())
```

If your application does not configure logging for `aembit_edge`, the SDK produces zero output on `stdout` and `stderr`, and Python will not emit `"No handler found"` warnings.

## Enabling Standard Library Logging

To capture debug or operational logs using Python's standard library `logging`:

```python
import logging

# Configure standard logger for the aembit_edge namespace
logging.basicConfig(level=logging.INFO)
logging.getLogger("aembit_edge").setLevel(logging.DEBUG)
```

Run the runnable standard logging example:

```bash
uv run python examples/logging_integration/standard_logging_example.py
```

## Integrating with Loguru

If your application uses [Loguru](https://github.com/Delgan/loguru), route standard logging records using an `InterceptHandler`:

```python
import inspect
import logging
from loguru import logger


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        level: str | int
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


# Redirect aembit_edge records to Loguru
sdk_logger = logging.getLogger("aembit_edge")
sdk_logger.handlers = [InterceptHandler()]
sdk_logger.setLevel(logging.DEBUG)
```

Run the Loguru example:

```bash
uv run python examples/logging_integration/loguru_example.py
```

## Integrating with Structlog

If your application uses [structlog](https://www.structlog.org/), configure standard library logging routing so standard `logging.getLogger("aembit_edge")` records pass through your structlog processors.

## Security & Sensitive Data Redaction

The SDK guarantees that:

- Bearer tokens (`accessToken`) are **never** logged.
- Target credential secrets (passwords, tokens, API keys, private keys) are **never** logged.
- Only safe metadata (server host, port, credential type, expiration timestamps) is emitted in log messages.
