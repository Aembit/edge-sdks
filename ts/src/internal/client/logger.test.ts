// Copyright 2024-present Aembit, Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest"
import { SafeLogger } from "./logger.js"
import type { AembitLogger } from "../../types/logger.js"

describe("SafeLogger", () => {
  it("defaults to no-op when no logger is provided", () => {
    const safeLogger = new SafeLogger()
    expect(safeLogger.isEnabled).toBe(false)

    // Should not throw
    expect(() => {
      safeLogger.debug("debug message", { key: "value" })
      safeLogger.info("info message", { key: "value" })
      safeLogger.warn("warn message", { key: "value" })
      safeLogger.error("error message", { key: "value" })
    }).not.toThrow()
  })

  it("delegates log calls to the provided logger", () => {
    const debugSpy = vi.fn()
    const infoSpy = vi.fn()
    const warnSpy = vi.fn()
    const errorSpy = vi.fn()

    const mockLogger: AembitLogger = {
      debug: debugSpy,
      info: infoSpy,
      warn: warnSpy,
      error: errorSpy
    }

    const safeLogger = new SafeLogger(mockLogger)
    expect(safeLogger.isEnabled).toBe(true)

    safeLogger.debug("debug msg", { foo: "bar" })
    expect(debugSpy).toHaveBeenCalledWith("debug msg", { foo: "bar" })

    safeLogger.info("info msg", { foo: "bar" })
    expect(infoSpy).toHaveBeenCalledWith("info msg", { foo: "bar" })

    safeLogger.warn("warn msg", { foo: "bar" })
    expect(warnSpy).toHaveBeenCalledWith("warn msg", { foo: "bar" })

    safeLogger.error("error msg", { foo: "bar" })
    expect(errorSpy).toHaveBeenCalledWith("error msg", { foo: "bar" })
  })

  it("gracefully catches errors thrown by the user logger", () => {
    const throwingLogger: AembitLogger = {
      debug: () => {
        throw new Error("Logger debug failure")
      },
      info: () => {
        throw new Error("Logger info failure")
      },
      warn: () => {
        throw new Error("Logger warn failure")
      },
      error: () => {
        throw new Error("Logger error failure")
      }
    }

    const safeLogger = new SafeLogger(throwingLogger)

    expect(() => {
      safeLogger.debug("debug")
      safeLogger.info("info")
      safeLogger.warn("warn")
      safeLogger.error("error")
    }).not.toThrow()
  })

  it("handles loggers with missing methods gracefully", () => {
    const infoSpy = vi.fn()
    const partialLogger = {
      info: infoSpy
    } as unknown as AembitLogger

    const safeLogger = new SafeLogger(partialLogger)

    expect(() => {
      safeLogger.debug("debug")
      safeLogger.info("info")
      safeLogger.warn("warn")
      safeLogger.error("error")
    }).not.toThrow()

    expect(infoSpy).toHaveBeenCalledWith("info", undefined)
  })
})
