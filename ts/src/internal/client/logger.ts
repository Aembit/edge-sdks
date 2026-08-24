// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { AembitLogger, LogContext } from "../../types/logger.js"

/**
 * Safe logger wrapper that guards against missing methods or exceptions thrown by injected loggers.
 */
export class SafeLogger {
  private readonly logger?: AembitLogger

  constructor(logger?: AembitLogger) {
    this.logger = logger
  }

  /**
   * Whether logging is enabled.
   */
  get isEnabled(): boolean {
    return this.logger !== undefined
  }

  debug(message: string, context?: LogContext): void {
    if (!this.logger || typeof this.logger.debug !== "function") {
      return
    }
    try {
      this.logger.debug(message, context)
    } catch {
      // User logger errors must not disrupt SDK execution
    }
  }

  info(message: string, context?: LogContext): void {
    if (!this.logger || typeof this.logger.info !== "function") {
      return
    }
    try {
      this.logger.info(message, context)
    } catch {
      // User logger errors must not disrupt SDK execution
    }
  }

  warn(message: string, context?: LogContext): void {
    if (!this.logger || typeof this.logger.warn !== "function") {
      return
    }
    try {
      this.logger.warn(message, context)
    } catch {
      // User logger errors must not disrupt SDK execution
    }
  }

  error(message: string, context?: LogContext): void {
    if (!this.logger || typeof this.logger.error !== "function") {
      return
    }
    try {
      this.logger.error(message, context)
    } catch {
      // User logger errors must not disrupt SDK execution
    }
  }
}
