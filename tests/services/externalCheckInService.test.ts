import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { getAccountSiteApiRouter } from "~/constants/siteType"
import { accountStorage } from "~/services/accounts/accountStorage"
import { handleExternalCheckInMessage } from "~/services/checkin/externalCheckInService"
import {
  createTab,
  createWindow,
  hasWindowsAPI,
} from "~/utils/browser/browserApi"
import { joinUrl } from "~/utils/core/url"

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: vi.fn(),
    markAccountAsCustomCheckedIn: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    createTab: vi.fn(),
    createWindow: vi.fn(),
    hasWindowsAPI: vi.fn(),
  }
})

vi.mock("~/constants/siteType", () => ({
  getAccountSiteApiRouter: vi.fn(() => ({ redeemPath: "/redeem" })),
}))

vi.mock("~/utils/core/url", () => ({
  joinUrl: vi.fn((base: string, path: string) => `${base}${path}`),
}))

const mockedAccountStorage = vi.mocked(accountStorage)
const mockedCreateTab = vi.mocked(createTab)
const mockedCreateWindow = vi.mocked(createWindow)
const mockedHasWindowsAPI = vi.mocked(hasWindowsAPI)
const mockedGetAccountSiteApiRouter = vi.mocked(getAccountSiteApiRouter)
const mockedJoinUrl = vi.mocked(joinUrl)

describe("handleExternalCheckInMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedHasWindowsAPI.mockReturnValue(false)
  })

  it("returns error when accountIds missing", async () => {
    const sendResponse = vi.fn()

    await handleExternalCheckInMessage(
      { action: RuntimeActionIds.ExternalCheckInOpenAndMark },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing accountIds",
    })
  })

  it("returns error for unknown actions", async () => {
    const sendResponse = vi.fn()

    await handleExternalCheckInMessage(
      { action: "UNKNOWN_ACTION" },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("reports invalid account ids without querying storage", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null as any)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["", 123, "ok-id"],
      },
      sendResponse,
    )

    expect(mockedAccountStorage.getAccountById).toHaveBeenCalledTimes(1)
    expect(mockedAccountStorage.getAccountById).toHaveBeenCalledWith("ok-id")
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              accountId: "",
              error: "Invalid accountId",
            }),
            expect.objectContaining({
              accountId: "123",
              error: "Invalid accountId",
            }),
          ]),
        }),
      }),
    )
  })

  it("reports missing accounts without opening any pages", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null as any)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["missing-id"],
      },
      sendResponse,
    )

    expect(mockedCreateTab).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          results: [
            expect.objectContaining({
              accountId: "missing-id",
              error: "Account not found",
            }),
          ],
        }),
      }),
    )
  })

  it("reports accounts missing a custom check-in URL", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a0",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: { customCheckIn: { url: "   " } },
    } as any)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a0"],
      },
      sendResponse,
    )

    expect(mockedCreateTab).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          results: [
            expect.objectContaining({
              accountId: "a0",
              error: "Missing custom check-in URL",
            }),
          ],
        }),
      }),
    )
  })

  it("does not mark account when check-in tab open fails", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a1",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: true,
        },
      },
    } as any)

    mockedCreateTab
      .mockResolvedValueOnce({ id: 11 } as any)
      .mockResolvedValueOnce(undefined as any)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a1"],
      },
      sendResponse,
    )

    expect(mockedGetAccountSiteApiRouter).toHaveBeenCalledWith("one-api")
    expect(mockedJoinUrl).toHaveBeenCalledWith("https://example.com", "/redeem")
    expect(mockedCreateTab).toHaveBeenNthCalledWith(
      1,
      "https://example.com/redeem",
      true,
    )
    expect(mockedCreateTab).toHaveBeenNthCalledWith(
      2,
      "https://checkin.example",
      true,
    )
    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).not.toHaveBeenCalled()

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        data: expect.objectContaining({
          openedCount: 0,
          markedCount: 0,
          failedCount: 1,
          totalCount: 1,
        }),
      }),
    )
  })

  it("marks account when check-in opens even if redeem fails", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a2",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: true,
        },
      },
    } as any)

    mockedCreateTab
      .mockRejectedValueOnce(new Error("redeem blocked"))
      .mockResolvedValueOnce({ id: 22 } as any)

    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a2"],
      },
      sendResponse,
    )

    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a2")
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          openedCount: 1,
          markedCount: 1,
          failedCount: 0,
          totalCount: 1,
        }),
      }),
    )
  })

  it("opens pages in a new window when requested", async () => {
    const sendResponse = vi.fn()
    mockedHasWindowsAPI.mockReturnValue(true)

    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a3",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: true,
        },
      },
    } as any)

    mockedCreateWindow.mockResolvedValue({ id: 123 } as any)
    mockedCreateTab.mockResolvedValueOnce({ id: 33 } as any)
    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a3"],
        openInNewWindow: true,
      },
      sendResponse,
    )

    expect(mockedGetAccountSiteApiRouter).toHaveBeenCalledWith("one-api")
    expect(mockedJoinUrl).toHaveBeenCalledWith("https://example.com", "/redeem")
    expect(mockedCreateWindow).toHaveBeenCalledWith({
      url: "https://example.com/redeem",
      focused: true,
    })
    expect(mockedCreateTab).toHaveBeenCalledWith(
      "https://checkin.example",
      true,
      {
        windowId: 123,
      },
    )
    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a3")
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          openedCount: 1,
          markedCount: 1,
          failedCount: 0,
          totalCount: 1,
        }),
      }),
    )
  })

  it("skips redeem when the account disables redeem-with-check-in", async () => {
    const sendResponse = vi.fn()
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a4",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: false,
        },
      },
    } as any)
    mockedCreateTab.mockResolvedValueOnce({ id: 44 } as any)
    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a4"],
      },
      sendResponse,
    )

    expect(mockedJoinUrl).not.toHaveBeenCalled()
    expect(mockedCreateTab).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          results: [
            expect.objectContaining({
              accountId: "a4",
              openedRedeem: null,
              openedCheckIn: true,
              markedCheckedIn: true,
            }),
          ],
        }),
      }),
    )
  })

  it("recreates the target window when adding a tab to the existing window fails", async () => {
    const sendResponse = vi.fn()
    mockedHasWindowsAPI.mockReturnValue(true)
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a5",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: true,
        },
      },
    } as any)
    mockedCreateWindow
      .mockResolvedValueOnce({ id: 300 } as any)
      .mockResolvedValueOnce({ id: 301 } as any)
    mockedCreateTab.mockRejectedValueOnce(new Error("window closed"))
    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    await handleExternalCheckInMessage(
      {
        action: RuntimeActionIds.ExternalCheckInOpenAndMark,
        accountIds: ["a5"],
        openInNewWindow: true,
      },
      sendResponse,
    )

    expect(mockedCreateWindow).toHaveBeenNthCalledWith(2, {
      url: "https://checkin.example",
      focused: true,
    })
    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a5")
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    )
  })
})
