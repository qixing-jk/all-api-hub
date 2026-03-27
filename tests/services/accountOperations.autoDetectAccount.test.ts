import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { SUB2API } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { autoDetectAccount } from "~/services/accounts/accountOperations"
import { AuthTypeEnum } from "~/types"

const {
  mockAutoDetectSmart,
  mockSendRuntimeMessage,
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
} = vi.hoisted(() => ({
  mockAutoDetectSmart: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
}))

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: mockAutoDetectSmart,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
    })),
  }
})

describe("accountOperations autoDetectAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns Sub2API result with default exchange rate and empty username", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 1,
        user: { id: 1, username: "" },
        siteType: SUB2API,
        accessToken: "jwt-token",
      },
    })

    mockFetchSiteStatus.mockResolvedValue(null)
    mockFetchSupportCheckIn.mockResolvedValue(false)
    mockExtractDefaultExchangeRate.mockReturnValue(null)

    const result = await autoDetectAccount(
      "https://sub2.example.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data?.siteType).toBe(SUB2API)
    expect(result.data?.username).toBe("")
    expect(result.data?.accessToken).toBe("jwt-token")
    expect(result.data?.exchangeRate).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
  })

  it("maps current-tab content-script failures to a reload hint", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: false,
      error: "some generic failure",
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
    })

    const result = await autoDetectAccount(
      "https://example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(false)
    expect(result.detailedError).toMatchObject({
      type: "current_tab_reload_required",
      message: "messages:autodetect.currentTabNeedsReload",
      actionText: "accountDialog:actions.reloadCurrentPage",
    })
  })
})
