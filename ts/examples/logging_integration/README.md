# Logging Integration Example

This example demonstrates how to integrate third-party logging engines (such as **Winston**, **Pino**, or standard JSON formatters) with the Aembit Edge TypeScript SDK using the `AembitLogger` interface.

## Overview

By default, the TypeScript SDK is completely silent and produces zero console output. When internal diagnostic logging is needed (e.g. for monitoring credential retrieval, token caching, or error diagnostics), you can pass a custom `logger` implementing `AembitLogger` into `EdgeClientConfig`.

SDK logs will seamlessly inherit your application's formatting, log level filters, and JSON aggregation schema.

## The `AembitLogger` Interface

```typescript
import type { AembitLogger, LogContext } from "@aembit/edge-sdk";

export interface AembitLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
```

---

## Integration Snippets

### 1. Integrating with Pino

```typescript
import pino from "pino";
import { EdgeClient, trustProviders, type AembitLogger } from "@aembit/edge-sdk";

const pinoLogger = pino({ level: "debug" });

// Wrap Pino into the AembitLogger interface
const aembitLogger: AembitLogger = {
  debug: (msg, ctx) => pinoLogger.debug(ctx, msg),
  info: (msg, ctx) => pinoLogger.info(ctx, msg),
  warn: (msg, ctx) => pinoLogger.warn(ctx, msg),
  error: (msg, ctx) => pinoLogger.error(ctx, msg),
};

const client = new EdgeClient({
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsRole({ region: "us-east-1" }),
  logger: aembitLogger,
});
```

### 2. Integrating with Winston

```typescript
import winston from "winston";
import { EdgeClient, trustProviders, type AembitLogger } from "@aembit/edge-sdk";

const winstonLogger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Wrap Winston into the AembitLogger interface
const aembitLogger: AembitLogger = {
  debug: (msg, ctx) => winstonLogger.debug(msg, ctx),
  info: (msg, ctx) => winstonLogger.info(msg, ctx),
  warn: (msg, ctx) => winstonLogger.warn(msg, ctx),
  error: (msg, ctx) => winstonLogger.error(msg, ctx),
};

const client = new EdgeClient({
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsRole({ region: "us-east-1" }),
  logger: aembitLogger,
});
```

### 3. Integrating with Standard Console

```typescript
import { EdgeClient, trustProviders, type AembitLogger } from "@aembit/edge-sdk";

const consoleLogger: AembitLogger = {
  debug: (msg, ctx) => console.debug(`[DEBUG] ${msg}`, ctx ?? ""),
  info: (msg, ctx) => console.info(`[INFO] ${msg}`, ctx ?? ""),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx ?? ""),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx ?? ""),
};

const client = new EdgeClient({
  baseUrl: "https://<tenant>.ec.<region>.aembit.io",
  clientId: "your-edge-sdk-client-id",
  trustProvider: trustProviders.awsRole({ region: "us-east-1" }),
  logger: consoleLogger,
});
```

---

## Security & Sensitive Data Redaction

The SDK strictly ensures that sensitive credentials and secrets are **never** logged:

- Bearer/Access tokens are excluded from all log messages.
- Returned credential payload data (`apiKey`, `password`, private keys, etc.) is omitted.
- Only safe operational metadata is emitted (e.g., target host/port, credential type name, expiration timestamps, provider IDs).
