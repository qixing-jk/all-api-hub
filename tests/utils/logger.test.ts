import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LoggingPreferences } from "~/types/logging"
import {
  createLogger,
  setLoggerContext,
  setLoggingPreferences,
} from "~/utils/logger"

/**
 * Unit tests for the unified logger:
 * - level gating + console enablement
 * - console sink method mapping
 * - redaction + URL sanitization
 * - resilience against circular/unserializable details
 */

const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log,
}

const flushMicrotasks = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const enableLogging = (overrides?: Partial<LoggingPreferences>) => {
  setLoggingPreferences({
    consoleEnabled: true,
    level: "debug",
    ...overrides,
  })
}

describe("unified logger", () => {
  beforeEach(async () => {
    await flushMicrotasks()
    setLoggerContext("Background")
    enableLogging()
  })

  afterEach(() => {
    ;(console as any).debug = originalConsole.debug
    ;(console as any).info = originalConsole.info
    ;(console as any).warn = originalConsole.warn
    ;(console as any).error = originalConsole.error
    ;(console as any).log = originalConsole.log
    vi.restoreAllMocks()
  })

  it("gates emission by minimum level", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    enableLogging({ level: "warn" })

    const logger = createLogger("TestScope")
    logger.debug("debug")
    logger.info("info")
    logger.warn("warn")
    logger.error("error")

    expect(debugSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[Background][TestScope]")

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[Background][TestScope]")
  })

  it("maps debug to console.log when console.debug is unavailable", () => {
    ;(console as any).debug = undefined
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const logger = createLogger("TestScope")
    logger.debug("debug")

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]?.[0]).toContain("[Background][TestScope]")
  })

  it("maps info to console.log when console.info is unavailable", () => {
    ;(console as any).info = undefined
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const logger = createLogger("TestScope")
    logger.info("info")

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]?.[0]).toContain("[Background][TestScope]")
  })

  it("redacts sensitive keys and sanitizes URL-like values", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

    setLoggerContext("Options")
    enableLogging({ level: "debug" })

    const logger = createLogger("RedactionTest")
    logger.info("hello", {
      token: "token-secret",
      accessToken: "access-secret",
      apiKey: "api-secret",
      key: "key-secret",
      authorization: "Bearer auth-secret",
      cookie: "session=session-secret",
      sessionCookie: "session=session-secret",
      backupPayload: "backup-secret",
      url: "https://example.com/path?token=leak#fragment",
      rawUrl: "https://example.com/other?x=y#hash",
      nested: {
        adminToken: "admin-secret",
        managementKey: "mgmt-secret",
        refresh_token: "refresh-secret",
      },
      list: [{ key: "nested-key-secret" }],
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const details = infoSpy.mock.calls[0]?.[1] as any

    expect(details.token).toBe("[REDACTED]")
    expect(details.accessToken).toBe("[REDACTED]")
    expect(details.apiKey).toBe("[REDACTED]")
    expect(details.key).toBe("[REDACTED]")
    expect(details.authorization).toBe("[REDACTED]")
    expect(details.cookie).toBe("[REDACTED]")
    expect(details.sessionCookie).toBe("[REDACTED]")
    expect(details.backupPayload).toBe("[REDACTED]")

    expect(details.url).toBe("https://example.com/path")
    expect(details.rawUrl).toBe("https://example.com/other")

    expect(details.nested.adminToken).toBe("[REDACTED]")
    expect(details.nested.managementKey).toBe("[REDACTED]")
    expect(details.nested.refresh_token).toBe("[REDACTED]")
    expect(details.list[0].key).toBe("[REDACTED]")
  })

  it("handles circular details without throwing", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

    const details: any = { name: "root" }
    details.self = details
    details.child = { parent: details }

    const logger = createLogger("CircularTest")
    expect(() => logger.info("circular", details)).not.toThrow()

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const safeDetails = infoSpy.mock.calls[0]?.[1] as any
    expect(safeDetails.self).toBe("[Circular]")
    expect(safeDetails.child.parent).toBe("[Circular]")
  })

  it("suppresses all logs when console logging is disabled and does not touch details", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    setLoggingPreferences({ consoleEnabled: false, level: "debug" })

    let accessed = false
    const details: any = {}
    Object.defineProperty(details, "token", {
      enumerable: true,
      get: () => {
        accessed = true
        return "token-secret"
      },
    })

    const logger = createLogger("SuppressedTest")
    logger.error("should not emit", details)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(accessed).toBe(false)
  })

  it("suppresses below-threshold logs and does not touch details", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

    enableLogging({ level: "warn" })

    let accessed = false
    const details: any = {}
    Object.defineProperty(details, "token", {
      enumerable: true,
      get: () => {
        accessed = true
        return "token-secret"
      },
    })

    const logger = createLogger("SuppressedLevelTest")
    logger.info("should not emit", details)

    expect(infoSpy).not.toHaveBeenCalled()
    expect(accessed).toBe(false)
  })
})
