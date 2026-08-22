// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Structured context object passed to logger methods.
 */
export type LogContext = Record<string, unknown>;

/**
 * Optional logger interface for capturing SDK internal operational events.
 * Compatible with Pino, Winston, Roarr, standard console, and custom logging frameworks.
 */
export interface AembitLogger {
  /**
   * Log a message at the debug level with optional structured context.
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log a message at the info level with optional structured context.
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a message at the warn level with optional structured context.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log a message at the error level with optional structured context.
   */
  error(message: string, context?: LogContext): void;
}
