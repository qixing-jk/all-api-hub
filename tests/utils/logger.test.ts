import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LoggingPreferences } from "~/types/logging"
import {
  createLogger,
  setLoggerContext,
  setLoggingPreferences,
} from "~/utils/core/logger"

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
      endpoint: "/usage?token=leak#fragment",
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
    expect(details.endpoint).toBe("/usage")

    expect(details.nested.adminToken).toBe("[REDACTED]")
    expect(details.nested.managementKey).toBe("[REDACTED]")
    expect(details.nested.refresh_token).toBe("[REDACTED]")
    expect(details.list[0].key).toBe("[REDACTED]")
  })

  it("preserves and sanitizes nested error causes", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const rootCause = new TypeError("fetch failed")
    ;(rootCause as any).cause = {
      endpoint: "https://example.com/path?token=secret#frag",
      apiKey: "nested-secret",
    }
    const error = new Error("persist failed", { cause: rootCause })

    const logger = createLogger("CauseTest")
    logger.error("webdav config failed", error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const details = errorSpy.mock.calls[0]?.[1] as any

    expect(details).toEqual({
      name: "Error",
      message: "persist failed",
      stack: error.stack,
      cause: {
        name: "TypeError",
        message: "fetch failed",
        stack: rootCause.stack,
        cause: {
          endpoint: "https://example.com/path",
          apiKey: "[REDACTED]",
        },
      },
    })
  })

  it("redacts sensitive nested error cause messages and stacks", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const rootCause = new TypeError(
      "request failed https://example.com/path?token=nested-secret#frag apiKey=nested-key password=nested-password API key: nested-api-key access token: nested-access client secret: nested-client-secret",
    )
    rootCause.stack =
      "TypeError: request failed https://example.com/path?token=nested-secret#frag apiKey=nested-key password=nested-password API key: nested-api-key access token: nested-access client secret: nested-client-secret\n    at nested"
    const error = new Error("top-level message keeps legacy behavior", {
      cause: rootCause,
    })

    const logger = createLogger("SensitiveCauseTest")
    logger.error("failed with sensitive nested cause", error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const details = errorSpy.mock.calls[0]?.[1] as any

    expect(details.message).toBe("top-level message keeps legacy behavior")
    expect(details.cause.message).not.toContain("nested-secret")
    expect(details.cause.message).not.toContain("nested-key")
    expect(details.cause.message).not.toContain("nested-password")
    expect(details.cause.message).not.toContain("nested-api-key")
    expect(details.cause.message).not.toContain("nested-access")
    expect(details.cause.message).not.toContain("nested-client-secret")
    expect(details.cause.stack).not.toContain("nested-secret")
    expect(details.cause.stack).not.toContain("nested-key")
    expect(details.cause.stack).not.toContain("nested-password")
    expect(details.cause.stack).not.toContain("nested-api-key")
    expect(details.cause.stack).not.toContain("nested-access")
    expect(details.cause.stack).not.toContain("nested-client-secret")
    expect(details.cause.message).toContain("[REDACTED]")
    expect(details.cause.stack).toContain("[REDACTED]")
    expect(details.cause.message).toContain("https://example.com/path")
    expect(details.cause.message).not.toContain("?token=")
  })

  it("serializes repeated non-circular error references consistently", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const repeatedCause = new Error("shared failure")
    const wrapper = new Error("wrapper", {
      cause: {
        first: repeatedCause,
        second: repeatedCause,
      },
    })

    const logger = createLogger("RepeatedCauseTest")
    logger.error("repeated cause", wrapper)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const details = errorSpy.mock.calls[0]?.[1] as any

    expect(details.cause.first).toEqual({
      name: "Error",
      message: "shared failure",
      stack: repeatedCause.stack,
    })
    expect(details.cause.second).toEqual(details.cause.first)
    expect(details.cause.second).not.toBe("[Circular]")
  })

  it("does not throw on circular error causes", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const selfCauseError = new Error("loop")
    ;(selfCauseError as any).cause = selfCauseError
    const objectCause: any = { reason: "manual cause" }
    objectCause.self = objectCause
    const wrapper = new Error("wrapper")
    ;(wrapper as any).cause = objectCause

    const logger = createLogger("CircularCauseTest")
    expect(() => logger.error("self cause", selfCauseError)).not.toThrow()
    expect(() => logger.error("object cause", wrapper)).not.toThrow()

    expect(errorSpy).toHaveBeenCalledTimes(2)
    const selfCauseDetails = errorSpy.mock.calls[0]?.[1] as any
    const objectCauseDetails = errorSpy.mock.calls[1]?.[1] as any
    expect(selfCauseDetails.cause).toBe("[Circular]")
    expect(objectCauseDetails.cause.self).toBe("[Circular]")
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
