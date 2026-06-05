import { beforeEach, describe, expect, it, vi } from "vitest"

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const messagingMock = vi.hoisted(() => ({
  defineExtensionMessaging: vi.fn(),
  logger: undefined as
    | {
        debug: (message: unknown, ...details: unknown[]) => void
        log: (message: unknown, ...details: unknown[]) => void
        warn: (message: unknown, ...details: unknown[]) => void
        error: (message: unknown, ...details: unknown[]) => void
      }
    | undefined,
}))

vi.mock("~/services/runtimeMessaging/extensionMessaging", () => ({
  defineExtensionMessaging: messagingMock.defineExtensionMessaging,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => loggerMock),
}))

async function importMessagingModule(path: string) {
  vi.resetModules()
  messagingMock.logger = undefined
  messagingMock.defineExtensionMessaging.mockImplementation((options) => {
    messagingMock.logger = options?.logger
    return {
      sendMessage: vi.fn(),
      onMessage: vi.fn(),
    }
  })

  switch (path) {
    case "~/services/productAnalytics/messaging":
      await import("~/services/productAnalytics/messaging")
      break
    case "~/services/redemption/redemptionAssistMessaging":
      await import("~/services/redemption/redemptionAssistMessaging")
      break
    case "~/services/verification/webAiApiCheck/messaging":
      await import("~/services/verification/webAiApiCheck/messaging")
      break
    default:
      throw new Error(`Unsupported module path: ${path}`)
  }

  expect(messagingMock.logger).toBeDefined()
  return messagingMock.logger!
}

describe("privacy-sensitive messaging loggers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    "~/services/productAnalytics/messaging",
    "~/services/redemption/redemptionAssistMessaging",
    "~/services/verification/webAiApiCheck/messaging",
  ])("stringifies messages and drops payload details for %s", async (path) => {
    const logger = await importMessagingModule(path)
    const payload = { token: "sk-test", code: "redeem-code" }

    logger.debug("ready", payload)
    logger.log({ event: "sent" }, payload)
    logger.warn(123, payload)
    logger.error(false, payload)

    expect(loggerMock.debug).toHaveBeenCalledWith("ready")
    expect(loggerMock.info).toHaveBeenCalledWith("[object Object]")
    expect(loggerMock.warn).toHaveBeenCalledWith("123")
    expect(loggerMock.error).toHaveBeenCalledWith("false")
    expect(loggerMock.debug).not.toHaveBeenCalledWith("ready", payload)
    expect(loggerMock.info).not.toHaveBeenCalledWith("[object Object]", payload)
    expect(loggerMock.warn).not.toHaveBeenCalledWith("123", payload)
    expect(loggerMock.error).not.toHaveBeenCalledWith("false", payload)
  })
})
