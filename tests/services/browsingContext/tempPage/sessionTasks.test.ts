import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  executeAutoDetectSite,
  executeCredentialPageInspect,
} from "~/services/browsingContext/tempPage/sessionTasks"

const { acquire, release, sendMessage, navigate } = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  sendMessage: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("~/services/browsingContext/tempPage/runtime", () => ({
  tempWindowBackgroundRuntime: { acquire, release },
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendTabMessageWithRetry: sendMessage,
}))

describe("temp-page onboarding session probe", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    acquire.mockResolvedValue({ tabId: 42, navigate })
    release.mockResolvedValue(undefined)
    sendMessage.mockResolvedValue({
      success: true,
      data: { userId: "1", siteTypeHint: SITE_TYPES.NEW_API },
    })
  })

  it.each([true, false])(
    "releases the owned credential inspection context after messaging success=%s",
    async (success) => {
      if (success)
        sendMessage.mockResolvedValueOnce({
          success: true,
          state: "credential",
        })
      else sendMessage.mockRejectedValueOnce(new Error("closed"))
      const response = vi.fn()
      const authorize = vi.fn()
      await executeCredentialPageInspect(
        {
          originUrl: "https://example.invalid/profile",
          requestId: "inspect-1",
        },
        true,
        response,
        authorize,
      )
      expect(acquire).toHaveBeenCalledWith(
        "https://example.invalid/profile",
        "inspect-1",
        true,
        {},
        authorize,
      )
      expect(sendMessage).toHaveBeenCalledWith(42, {
        action: RuntimeActionIds.ContentInspectCredentialPage,
        requestId: "inspect-1",
      })
      expect(navigate).toHaveBeenCalledWith("https://example.invalid/profile", {
        requestId: "inspect-1",
        origin: "https://example.invalid/profile",
      })
      expect(release).toHaveBeenCalledWith("inspect-1")
      expect(response).toHaveBeenCalledWith(
        success ? { success: true, state: "credential" } : { success: false },
      )
    },
  )

  it("forwards explicit unknown-site probe intent and preserves the detected type", async () => {
    const sendResponse = vi.fn()
    await executeAutoDetectSite(
      {
        url: "https://white-label.example.invalid/console",
        requestId: "detect-white-label",
        diagnosticId: "diagnostic-parent",
        siteType: SITE_TYPES.UNKNOWN,
        allowSessionProbe: true,
        cookieStoreId: "firefox-container-1",
      },
      true,
      sendResponse,
    )
    expect(sendMessage).toHaveBeenCalledWith(42, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://white-label.example.invalid/console",
      siteType: SITE_TYPES.UNKNOWN,
      diagnosticId: "diagnostic-parent",
      allowSessionProbe: true,
    })
    expect(acquire).toHaveBeenCalledWith(
      "https://white-label.example.invalid/console",
      "detect-white-label",
      true,
      expect.objectContaining({ cookieStoreId: "firefox-container-1" }),
      undefined,
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        userId: "1",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    })
    expect(release).toHaveBeenCalledWith("detect-white-label")
  })

  it.each([
    [SITE_TYPES.UNKNOWN, undefined],
    [SITE_TYPES.UNKNOWN, false],
    [SITE_TYPES.SUB2API, true],
    [SITE_TYPES.NEW_API, true],
  ])(
    "does not enable probing for site %s with intent %s",
    async (siteType, allowSessionProbe) => {
      await executeAutoDetectSite(
        {
          url: "https://site.example.invalid",
          requestId: "detect-default",
          siteType,
          allowSessionProbe,
        },
        false,
        vi.fn(),
      )
      expect(sendMessage).toHaveBeenCalledWith(
        42,
        expect.not.objectContaining({ allowSessionProbe: true }),
      )
      expect(sendMessage.mock.calls.at(-1)?.[1]).not.toHaveProperty(
        "expectedOrigin",
      )
    },
  )

  it("returns a cookie-store failure instead of reporting an unauthenticated success", async () => {
    acquire.mockRejectedValueOnce(
      Object.assign(
        new Error("Requested browser cookie store is unavailable"),
        {
          name: "CookieStoreContextUnavailableError",
        },
      ),
    )
    const sendResponse = vi.fn()

    await executeAutoDetectSite(
      {
        url: "https://white-label.example.invalid/console",
        requestId: "detect-store-error",
        siteType: SITE_TYPES.UNKNOWN,
        cookieStoreId: "missing-store",
      },
      false,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Requested browser cookie store is unavailable",
    })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

it("generates an owned request identity and rejects an empty inspection response", async () => {
  vi.resetAllMocks()
  acquire.mockResolvedValue({ tabId: 42, navigate })
  release.mockResolvedValue(undefined)
  sendMessage.mockResolvedValueOnce(undefined)
  const response = vi.fn()
  await executeCredentialPageInspect(
    { originUrl: "https://example.invalid/profile" },
    false,
    response,
  )
  const requestId = acquire.mock.calls.at(-1)![1]
  expect(requestId).toEqual(expect.any(String))
  expect(requestId.length).toBeGreaterThan(0)
  expect(release).toHaveBeenLastCalledWith(requestId)
  expect(response).toHaveBeenCalledWith({ success: false })
})
