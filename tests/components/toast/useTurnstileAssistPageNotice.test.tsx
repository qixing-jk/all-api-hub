import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTurnstileAssistPageNotice } from "~/components/toast/useTurnstileAssistPageNotice"
import { RuntimeActionIds } from "~/constants/runtimeActions"

const { onRuntimeMessageMock, showTurnstileAssistPageNoticeMock } = vi.hoisted(
  () => ({
    onRuntimeMessageMock: vi.fn(),
    showTurnstileAssistPageNoticeMock: vi.fn(),
  }),
)

vi.mock("~/utils/browser/runtimeMessages", () => ({
  onRuntimeMessage: onRuntimeMessageMock,
}))

vi.mock("~/services/checkin/turnstile/assistPageNotice", () => ({
  showTurnstileAssistPageNotice: showTurnstileAssistPageNoticeMock,
}))

vi.mock("~/lib/notify", () => ({
  default: {
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}))

describe("useTurnstileAssistPageNotice", () => {
  let capturedListener: any = null
  const unsubscribeMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    capturedListener = null
    onRuntimeMessageMock.mockImplementation((listener) => {
      capturedListener = listener
      return unsubscribeMock
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("registers runtime message listener and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useTurnstileAssistPageNotice())

    expect(onRuntimeMessageMock).toHaveBeenCalledOnce()
    expect(capturedListener).not.toBeNull()

    unmount()
    expect(unsubscribeMock).toHaveBeenCalledOnce()
  })

  it("ignores messages with other actions", () => {
    renderHook(() => useTurnstileAssistPageNotice())

    const sendResponse = vi.fn()
    capturedListener({ action: "OTHER_ACTION" }, {}, sendResponse)

    expect(showTurnstileAssistPageNoticeMock).not.toHaveBeenCalled()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it("calls showTurnstileAssistPageNotice and replies with presented: true when shown", () => {
    showTurnstileAssistPageNoticeMock.mockReturnValue(true)
    renderHook(() => useTurnstileAssistPageNotice())

    const sendResponse = vi.fn()
    const request = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId: "req-123",
    }
    capturedListener(request, {}, sendResponse)

    expect(showTurnstileAssistPageNoticeMock).toHaveBeenCalledWith(
      request,
      expect.any(Object),
    )
    expect(sendResponse).toHaveBeenCalledWith({ presented: true })
  })

  it("does not reply when showTurnstileAssistPageNotice returns false", () => {
    showTurnstileAssistPageNoticeMock.mockReturnValue(false)
    renderHook(() => useTurnstileAssistPageNotice())

    const sendResponse = vi.fn()
    const request = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId: "req-456",
    }
    capturedListener(request, {}, sendResponse)

    expect(showTurnstileAssistPageNoticeMock).toHaveBeenCalledWith(
      request,
      expect.any(Object),
    )
    expect(sendResponse).not.toHaveBeenCalled()
  })
})
