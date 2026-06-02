import { beforeEach, describe, expect, it, vi } from "vitest"

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => loggerMock),
}))

describe("runtime messaging logger adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps string messages textual and passes variadic details as an array", async () => {
    const { createRuntimeMessagingLogger } = await import(
      "~/services/runtimeMessaging/logger"
    )

    const logger = createRuntimeMessagingLogger("Messaging")
    logger.debug("ready", { attempt: 1 }, "extra")

    expect(loggerMock.debug).toHaveBeenCalledWith("ready", [
      { attempt: 1 },
      "extra",
    ])
  })

  it("stringifies non-string messages while preserving the original value in details", async () => {
    const { createRuntimeMessagingLogger } = await import(
      "~/services/runtimeMessaging/logger"
    )

    const logger = createRuntimeMessagingLogger("Messaging")
    const message = { type: "request" }
    logger.log(message, "context")
    logger.warn(123)
    logger.error(false, { failed: true })

    expect(loggerMock.info).toHaveBeenCalledWith("[object Object]", [
      message,
      "context",
    ])
    expect(loggerMock.warn).toHaveBeenCalledWith("123", 123)
    expect(loggerMock.error).toHaveBeenCalledWith("false", [
      false,
      { failed: true },
    ])
  })
})
