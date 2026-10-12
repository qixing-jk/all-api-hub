import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { executeAutoDetectSite } from "~/services/browsingContext/tempPage/sessionTasks"

const { acquire, release, sendMessage } = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  sendMessage: vi.fn(),
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
    acquire.mockResolvedValue({ tabId: 42 })
    release.mockResolvedValue(undefined)
    sendMessage.mockResolvedValue({
      success: true,
      data: { userId: "1", siteTypeHint: SITE_TYPES.NEW_API },
    })
  })

  it("binds an explicit unknown-site probe to the requested origin and preserves the detected type", async () => {
    const sendResponse = vi.fn()
    await executeAutoDetectSite(
      {
        url: "https://white-label.example.invalid/console",
        requestId: "detect-white-label",
        diagnosticId: "diagnostic-parent",
        siteType: SITE_TYPES.UNKNOWN,
        allowNewApiAuthProbe: true,
      },
      true,
      sendResponse,
    )
    expect(sendMessage).toHaveBeenCalledWith(42, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://white-label.example.invalid/console",
      siteType: SITE_TYPES.UNKNOWN,
      diagnosticId: "diagnostic-parent",
      allowNewApiAuthProbe: true,
      expectedOrigin: "https://white-label.example.invalid",
    })
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
    async (siteType, allowNewApiAuthProbe) => {
      await executeAutoDetectSite(
        {
          url: "https://site.example.invalid",
          requestId: "detect-default",
          siteType,
          allowNewApiAuthProbe,
        },
        false,
        vi.fn(),
      )
      expect(sendMessage).toHaveBeenCalledWith(
        42,
        expect.not.objectContaining({ allowNewApiAuthProbe: true }),
      )
    },
  )
})
