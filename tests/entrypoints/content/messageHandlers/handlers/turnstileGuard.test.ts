import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  handleInspectCheckinPage,
  handleTriggerCheckinPageAction,
} from "~/entrypoints/content/messageHandlers/handlers/checkinPage"
import { handleWaitForTurnstileToken } from "~/entrypoints/content/messageHandlers/handlers/turnstileGuard"
import {
  PAGE_VERIFICATION_STATUSES,
  TURNSTILE_PRE_TRIGGER_KINDS,
  TURNSTILE_TOKEN_WAIT_STATUSES,
} from "~/types/turnstile"

const {
  loggerMocks,
  triggerCheckinPageActionMock,
  waitForTurnstileTokenMock,
  waitForCheckinPageActionTargetMock,
  inspectCheckinPageMock,
  sendRuntimeMessageMock,
  showTurnstileManualAssistToastMock,
} = vi.hoisted(() => ({
  loggerMocks: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  triggerCheckinPageActionMock: vi.fn(),
  waitForTurnstileTokenMock: vi.fn(),
  waitForCheckinPageActionTargetMock: vi.fn(),
  inspectCheckinPageMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  showTurnstileManualAssistToastMock: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/services/checkin/pageVerification", () => ({
  capturePageVerificationWidgets: vi.fn(() => new Set()),
  waitForPageVerification: vi.fn(async () => ({
    status: PAGE_VERIFICATION_STATUSES.NotPresent,
  })),
}))

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: sendRuntimeMessageMock,
}))

vi.mock(
  "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts",
  () => ({
    showTurnstileManualAssistToast: showTurnstileManualAssistToastMock,
  }),
)

vi.mock("~/entrypoints/content/messageHandlers/utils/turnstileGuard", () => ({
  waitForTurnstileToken: waitForTurnstileTokenMock,
}))

describe("content turnstile guard handler", () => {
  it.each([false, true])(
    "waits for a hydrating default action before publishing page candidates (area: %s)",
    async (hasCheckInArea) => {
      vi.useFakeTimers()
      try {
        inspectCheckinPageMock
          .mockReturnValueOnce({
            success: true,
            hasTarget: false,
            hasCheckInArea,
            candidates: ["/daily"],
          })
          .mockReturnValue({ success: true, hasTarget: true, candidates: [] })
        const response = vi.fn()
        handleInspectCheckinPage(
          { trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton } },
          response,
        )
        await vi.advanceTimersByTimeAsync(0)
        expect(response).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1500)
        expect(response).toHaveBeenCalledWith({
          success: true,
          hasTarget: true,
          candidates: [],
        })
        expect(triggerCheckinPageActionMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it("returns read-only page evidence without triggering check-in or verification", async () => {
    inspectCheckinPageMock.mockReturnValue({
      success: true,
      hasTarget: false,
      candidates: ["/invite"],
    })
    const response = await new Promise((resolve) =>
      handleInspectCheckinPage(
        { trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton } },
        resolve,
      ),
    )
    expect(response).toEqual({
      success: true,
      hasTarget: false,
      candidates: ["/invite"],
    })
    expect(triggerCheckinPageActionMock).not.toHaveBeenCalled()
  })
  it("retains the explicit expectation for a delayed Turnstile widget", async () => {
    waitForTurnstileTokenMock.mockResolvedValue({
      status: TURNSTILE_TOKEN_WAIT_STATUSES.Timeout,
      detection: { hasTurnstile: false, score: 0, reasons: [] },
    })
    const response = await new Promise((resolve) =>
      handleWaitForTurnstileToken({ expectTurnstile: true }, resolve),
    )
    expect(response).toMatchObject({ success: true, status: "timeout" })
    expect(waitForTurnstileTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectTurnstile: true }),
    )
  })
  it("prepares a delayed native target without clicking", async () => {
    const trigger = {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
      selector: "#check-in",
      targetWaitMs: 1000,
    } as const
    const response = await new Promise<any>((resolve) => {
      handleTriggerCheckinPageAction(
        { trigger, prepareOnly: true } as any,
        resolve,
      )
    })
    expect(waitForCheckinPageActionTargetMock).toHaveBeenCalledWith(trigger)
    expect(triggerCheckinPageActionMock).not.toHaveBeenCalled()
    expect(response).toMatchObject({ success: true, clicked: false })
  })

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
    const preTrigger = {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
      selector: "#submit",
    } as const

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
      userAssist: expect.objectContaining({
        requestAssist: expect.any(Function),
        readPageToken: expect.any(Function),
      }),
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
      userAssist: expect.objectContaining({
        requestAssist: expect.any(Function),
        readPageToken: expect.any(Function),
      }),
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
    const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton } as const
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
      verification: { status: "not_present" },
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

  it("handles userAssist requestAssist when presentation succeeds, fails, or throws", async () => {
    let capturedAssist: any = null
    waitForTurnstileTokenMock.mockImplementationOnce(({ userAssist }) => {
      capturedAssist = userAssist
      return Promise.resolve({
        status: "found",
        token: "cf-token",
        detection: { hasTurnstile: true },
      })
    })

    await new Promise<any>((resolve) => {
      handleWaitForTurnstileToken({ requestId: "req-1" }, resolve)
    })

    expect(capturedAssist).not.toBeNull()

    // 1. Success case
    sendRuntimeMessageMock.mockResolvedValueOnce({ presented: true })
    const successResult = await capturedAssist.requestAssist()
    expect(successResult).toBe(true)
    expect(showTurnstileManualAssistToastMock).toHaveBeenCalledOnce()

    // 2. Failure case
    sendRuntimeMessageMock.mockResolvedValueOnce({ presented: false })
    const failResult = await capturedAssist.requestAssist()
    expect(failResult).toBe(false)

    // 3. Throw case
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error("runtime error"))
    const throwResult = await capturedAssist.requestAssist()
    expect(throwResult).toBe(false)
  })

  it("handles userAssist readPageToken for valid token, empty token, failure, or throw", async () => {
    let capturedAssist: any = null
    waitForTurnstileTokenMock.mockImplementationOnce(({ userAssist }) => {
      capturedAssist = userAssist
      return Promise.resolve({
        status: "found",
        token: "cf-token",
        detection: { hasTurnstile: true },
      })
    })

    await new Promise<any>((resolve) => {
      handleWaitForTurnstileToken({ requestId: "req-2" }, resolve)
    })

    expect(capturedAssist).not.toBeNull()

    // 1. Valid token with whitespace trimming
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: true,
      token: "  valid-token  ",
    })
    expect(await capturedAssist.readPageToken({ allowExecute: true })).toBe(
      "valid-token",
    )

    // 2. Empty string token
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: true,
      token: "   ",
    })
    expect(
      await capturedAssist.readPageToken({ allowExecute: false }),
    ).toBeNull()

    // 3. Success false
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      token: "valid-token",
    })
    expect(
      await capturedAssist.readPageToken({ allowExecute: false }),
    ).toBeNull()

    // 4. Runtime message throws
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error("runtime error"))
    expect(
      await capturedAssist.readPageToken({ allowExecute: false }),
    ).toBeNull()
  })
})

vi.mock("~/services/checkin/pageAction", () => ({
  triggerCheckinPageAction: triggerCheckinPageActionMock,
  waitForCheckinPageActionTarget: waitForCheckinPageActionTargetMock,
  inspectCheckinPage: inspectCheckinPageMock,
}))
