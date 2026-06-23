import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleTriggerCheckinPageAction,
  handleWaitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/handlers/turnstileGuard"

const { loggerMocks, triggerCheckinPageActionMock, waitForTurnstileTokenMock } =
  vi.hoisted(() => ({
    loggerMocks: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    triggerCheckinPageActionMock: vi.fn(),
    waitForTurnstileTokenMock: vi.fn(),
  }))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/entrypoints/content/messageHandlers/utils/turnstileGuard", () => ({
  triggerCheckinPageAction: triggerCheckinPageActionMock,
  waitForTurnstileToken: waitForTurnstileTokenMock,
}))

describe("content turnstile guard handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("forwards the wait request and returns the token result", async () => {
    const result = {
      status: "found",
      token: "cf-token",
      source: "response-field",
      detection: {
        hasTurnstile: true,
        reasons: ["response-field"],
        score: 5,
      },
    }
    const preTrigger = { kind: "clickSelector", selector: "#submit" } as const

    waitForTurnstileTokenMock.mockResolvedValue(result)

    const response = await new Promise<any>((resolve) => {
      expect(
        handleWaitForTurnstileToken(
          {
            requestId: "req-turnstile",
            timeoutMs: 2500,
            preTrigger,
          },
          resolve,
        ),
      ).toBe(true)
    })

    expect(waitForTurnstileTokenMock).toHaveBeenCalledWith({
      requestId: "req-turnstile",
      timeoutMs: 2500,
      preTrigger,
    })
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      "Turnstile token wait completed",
      {
        requestId: "req-turnstile",
        status: "found",
        hasTurnstile: true,
        score: 5,
        reasons: ["response-field"],
      },
    )
    expect(response).toEqual({
      success: true,
      ...result,
    })
  })

  it("returns an error response when the token wait rejects", async () => {
    waitForTurnstileTokenMock.mockRejectedValue(new Error("timeout"))

    const response = await new Promise<any>((resolve) => {
      expect(handleWaitForTurnstileToken({}, resolve)).toBe(true)
    })

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Turnstile token wait failed",
      {
        requestId: null,
        error: "timeout",
      },
    )
    expect(response).toEqual({
      success: false,
      error: "timeout",
    })
  })

  it("logs a null request id when the wait succeeds without request context", async () => {
    const result = {
      status: "not_present",
      detection: {
        hasTurnstile: false,
        reasons: [],
        score: 0,
      },
    }

    waitForTurnstileTokenMock.mockResolvedValue(result)

    const response = await new Promise<any>((resolve) => {
      expect(handleWaitForTurnstileToken({ timeoutMs: 500 }, resolve)).toBe(
        true,
      )
    })

    expect(waitForTurnstileTokenMock).toHaveBeenCalledWith({
      requestId: undefined,
      timeoutMs: 500,
      preTrigger: undefined,
    })
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      "Turnstile token wait completed",
      {
        requestId: null,
        status: "not_present",
        hasTurnstile: false,
        score: 0,
        reasons: [],
      },
    )
    expect(response).toEqual({
      success: true,
      ...result,
    })
  })

  it("handles native page action trigger requests", async () => {
    const trigger = { kind: "checkinButton" } as const
    const triggerResult = {
      status: "clicked",
      clicked: true,
      reason: "clicked",
      detection: {
        hasTurnstile: false,
        reasons: [],
        score: 0,
        title: "Check in",
        url: "https://example.invalid/console/personal",
      },
    }

    triggerCheckinPageActionMock.mockReturnValueOnce(triggerResult)

    const response = await new Promise<any>((resolve) => {
      expect(
        handleTriggerCheckinPageAction(
          {
            requestId: "req-native-action",
            trigger,
          },
          resolve,
        ),
      ).toBe(true)
    })

    expect(triggerCheckinPageActionMock).toHaveBeenCalledWith({
      requestId: "req-native-action",
      trigger,
    })
    expect(response).toEqual({
      success: true,
      ...triggerResult,
    })
  })

  it("passes through non-click trigger outcomes as successful payloads", async () => {
    const triggerResult = {
      status: "target_not_found",
      clicked: false,
      reason: "noTarget",
      detection: {
        hasTurnstile: false,
        reasons: [],
        score: 0,
        title: "Check in",
        url: "https://example.invalid/console/personal",
      },
    }

    triggerCheckinPageActionMock.mockReturnValueOnce(triggerResult)

    const response = await new Promise<any>((resolve) => {
      expect(handleTriggerCheckinPageAction({}, resolve)).toBe(true)
    })

    expect(response).toEqual({
      success: true,
      ...triggerResult,
    })
  })

  it("returns an error response when native page action triggering throws", async () => {
    triggerCheckinPageActionMock.mockImplementationOnce(() => {
      throw new Error("click failed")
    })

    const response = await new Promise<any>((resolve) => {
      expect(handleTriggerCheckinPageAction({}, resolve)).toBe(true)
    })

    expect(response).toEqual({
      success: false,
      error: "click failed",
    })
  })
})
