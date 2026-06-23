import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  tempWindowFetch,
  tempWindowGetRenderedTitle,
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"

const {
  sendRuntimeMessageMock,
  handleTempWindowFetchMock,
  handleTempWindowCheckinPageActionMock,
  handleTempWindowTurnstileFetchMock,
  handleTempWindowGetRenderedTitleMock,
} = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
  handleTempWindowFetchMock: vi.fn(),
  handleTempWindowCheckinPageActionMock: vi.fn(),
  handleTempWindowTurnstileFetchMock: vi.fn(),
  handleTempWindowGetRenderedTitleMock: vi.fn(),
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionBackground: () => true,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleTempWindowFetch: handleTempWindowFetchMock,
  handleTempWindowCheckinPageAction: handleTempWindowCheckinPageActionMock,
  handleTempWindowTurnstileFetch: handleTempWindowTurnstileFetchMock,
  handleTempWindowGetRenderedTitle: handleTempWindowGetRenderedTitleMock,
}))

describe("tempWindowFetch helpers (background context)", () => {
  it("delegates tempWindowFetch to the background handler", async () => {
    handleTempWindowFetchMock.mockImplementation((request, sendResponse) => {
      sendResponse({ success: true, data: request.fetchUrl })
    })

    const response = await tempWindowFetch({
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/test",
      fetchOptions: { method: "GET" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowFetchMock).toHaveBeenCalledTimes(1)
    expect(handleTempWindowFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/test",
        suppressMinimize: false,
      }),
      expect.any(Function),
    )
    expect(response).toEqual({
      success: true,
      data: "https://example.com/api/test",
    })
  })

  it("keeps the first tempWindowFetch response when the handler responds multiple times", async () => {
    handleTempWindowFetchMock.mockImplementation((_request, sendResponse) => {
      sendResponse({ success: true, data: "first" })
      sendResponse({ success: true, data: "second" })
    })

    const response = await tempWindowFetch({
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/test",
      fetchOptions: { method: "GET" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowFetchMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: true,
      data: "first",
    })
  })

  it("delegates tempWindowTurnstileFetch to the background handler", async () => {
    handleTempWindowTurnstileFetchMock.mockImplementation(
      (request, sendResponse) => {
        sendResponse({
          success: true,
          data: request.fetchUrl,
          turnstile: { status: "token_obtained", hasTurnstile: true },
        })
      },
    )

    const response = await tempWindowTurnstileFetch({
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowTurnstileFetchMock).toHaveBeenCalledTimes(1)
    expect(handleTempWindowTurnstileFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        suppressMinimize: false,
      }),
      expect.any(Function),
    )
    expect(response).toEqual({
      success: true,
      data: "https://example.com/api/checkin",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })
  })

  it("delegates tempWindowTriggerCheckinPageAction to the background handler", async () => {
    handleTempWindowCheckinPageActionMock.mockImplementation(
      (_request, sendResponse) => {
        sendResponse({
          success: true,
          reason: "clicked",
          identity: { userId: "target-user", user: { id: "target-user" } },
          trigger: {
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
          },
        })
      },
    )

    const response = await tempWindowTriggerCheckinPageAction({
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-wrapper",
    })

    expect(handleTempWindowCheckinPageActionMock).toHaveBeenCalledTimes(1)
    expect(response).toMatchObject({
      success: true,
      reason: "clicked",
      identity: { userId: "target-user" },
    })
  })

  it("keeps the first tempWindowTurnstileFetch response when the handler responds multiple times", async () => {
    handleTempWindowTurnstileFetchMock.mockImplementation(
      (_request, sendResponse) => {
        sendResponse({
          success: true,
          data: "first",
          turnstile: { status: "token_obtained", hasTurnstile: true },
        })
        sendResponse({
          success: false,
          error: "late error",
          turnstile: { status: "error", hasTurnstile: false },
        })
      },
    )

    const response = await tempWindowTurnstileFetch({
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowTurnstileFetchMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: true,
      data: "first",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })
  })

  it("delegates tempWindowGetRenderedTitle to the background handler", async () => {
    handleTempWindowGetRenderedTitleMock.mockImplementation(
      (request, sendResponse) => {
        sendResponse({ success: true, title: request.originUrl })
      },
    )

    const response = await tempWindowGetRenderedTitle({
      originUrl: "https://example.com",
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowGetRenderedTitleMock).toHaveBeenCalledTimes(1)
    expect(handleTempWindowGetRenderedTitleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowGetRenderedTitle,
        originUrl: "https://example.com",
        suppressMinimize: false,
      }),
      expect.any(Function),
    )
    expect(response).toEqual({ success: true, title: "https://example.com" })
  })

  it("returns a default failure when tempWindowFetch handler never responds", async () => {
    handleTempWindowFetchMock.mockImplementation(() => {})

    const response = await tempWindowFetch({
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/test",
      fetchOptions: { method: "GET" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowFetchMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: false,
      error: "Empty tempWindowFetch response",
    })
  })

  it("returns a default failure when tempWindowTurnstileFetch handler never responds", async () => {
    handleTempWindowTurnstileFetchMock.mockImplementation(() => {})

    const response = await tempWindowTurnstileFetch({
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowTurnstileFetchMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: false,
      error: "Empty tempWindowTurnstileFetch response",
      turnstile: { status: "error", hasTurnstile: false },
    })
  })

  it("returns a default failure when tempWindowGetRenderedTitle handler never responds", async () => {
    handleTempWindowGetRenderedTitleMock.mockImplementation(() => {})

    const response = await tempWindowGetRenderedTitle({
      originUrl: "https://example.com",
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowGetRenderedTitleMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: false,
      error: "Empty tempWindowGetRenderedTitle response",
    })
  })

  it("returns an explicit error when tempWindowGetRenderedTitle receives a malformed response", async () => {
    handleTempWindowGetRenderedTitleMock.mockImplementation(
      (_request, sendResponse) => {
        sendResponse({ success: true, title: 123 } as any)
      },
    )

    const response = await tempWindowGetRenderedTitle({
      originUrl: "https://example.com",
    })

    expect(sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(handleTempWindowGetRenderedTitleMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      success: false,
      error: "Invalid tempWindowGetRenderedTitle response",
    })
  })
})
