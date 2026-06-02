import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountStorage } from "~/services/accounts/accountStorage"
import { SITE_ROUTE_KINDS } from "~/services/accounts/utils/siteRouteResolver"
import { ExternalCheckInMessageTypes } from "~/services/checkin/externalCheckInMessaging"
import {
  openExternalCheckInsAndMark,
  setupExternalCheckInMessagingListeners,
} from "~/services/checkin/externalCheckInService"
import {
  createTab,
  createWindow,
  hasWindowsAPI,
} from "~/utils/browser/browserApi"

const { mockOnExternalCheckInMessage } = vi.hoisted(() => ({
  mockOnExternalCheckInMessage: vi.fn(() => vi.fn()),
}))

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

vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  SITE_ROUTE_KINDS: {
    Redeem: "redeem",
  },
  resolveAccountSiteRouteUrl: vi.fn((account: { baseUrl: string }) =>
    Promise.resolve(`${account.baseUrl}/redeem`),
  ),
}))

vi.mock(
  "~/services/checkin/externalCheckInMessaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/checkin/externalCheckInMessaging")
      >()
    return {
      ...actual,
      onExternalCheckInMessage: mockOnExternalCheckInMessage,
    }
  },
)

const mockedAccountStorage = vi.mocked(accountStorage)
const mockedCreateTab = vi.mocked(createTab)
const mockedCreateWindow = vi.mocked(createWindow)
const mockedHasWindowsAPI = vi.mocked(hasWindowsAPI)

const getMockedRouteResolver = async () => {
  const { resolveAccountSiteRouteUrl } = await import(
    "~/services/accounts/utils/siteRouteResolver"
  )
  return vi.mocked(resolveAccountSiteRouteUrl)
}

describe("openExternalCheckInsAndMark", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedHasWindowsAPI.mockReturnValue(false)
  })

  it("returns error when accountIds missing", async () => {
    await expect(openExternalCheckInsAndMark({} as any)).resolves.toEqual({
      success: false,
      error: "Missing accountIds",
    })
  })

  it("reports invalid account ids without querying storage", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null as any)

    const response = await openExternalCheckInsAndMark({
      accountIds: ["", 123, "ok-id"],
    } as any)

    expect(mockedAccountStorage.getAccountById).toHaveBeenCalledTimes(1)
    expect(mockedAccountStorage.getAccountById).toHaveBeenCalledWith("ok-id")
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
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
    mockedAccountStorage.getAccountById.mockResolvedValueOnce(null as any)

    const response = await openExternalCheckInsAndMark({
      accountIds: ["missing-id"],
    })

    expect(mockedCreateTab).not.toHaveBeenCalled()
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
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
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a0",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: { customCheckIn: { url: "   " } },
    } as any)

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a0"],
    })

    expect(mockedCreateTab).not.toHaveBeenCalled()
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
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

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a1"],
    })

    const mockedResolveAccountSiteRouteUrl = await getMockedRouteResolver()
    expect(mockedResolveAccountSiteRouteUrl).toHaveBeenCalledWith(
      { baseUrl: "https://example.com", siteType: "one-api" },
      SITE_ROUTE_KINDS.Redeem,
    )
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

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
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

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a2"],
    })

    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a2")
    expect(response).toEqual(
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

  it("marks account when check-in opens even if redeem URL resolution fails", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a2-route-error",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: true,
        },
      },
    } as any)

    const mockedResolveAccountSiteRouteUrl = await getMockedRouteResolver()
    mockedResolveAccountSiteRouteUrl.mockRejectedValueOnce(
      new Error("redeem route missing"),
    )
    mockedCreateTab.mockResolvedValueOnce({ id: 23 } as any)
    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a2-route-error"],
    })

    expect(mockedCreateTab).toHaveBeenCalledWith(
      "https://checkin.example",
      true,
    )
    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a2-route-error")
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          results: [
            expect.objectContaining({
              accountId: "a2-route-error",
              openedRedeem: false,
              openedCheckIn: true,
              markedCheckedIn: true,
              redeemError: "redeem route missing",
            }),
          ],
        }),
      }),
    )
  })

  it("opens pages in a new window when requested", async () => {
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

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a3"],
      openInNewWindow: true,
    })

    const mockedResolveAccountSiteRouteUrl = await getMockedRouteResolver()
    expect(mockedResolveAccountSiteRouteUrl).toHaveBeenCalledWith(
      { baseUrl: "https://example.com", siteType: "one-api" },
      SITE_ROUTE_KINDS.Redeem,
    )
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
    expect(response).toEqual(
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

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a4"],
    })

    const mockedResolveAccountSiteRouteUrl = await getMockedRouteResolver()
    expect(mockedResolveAccountSiteRouteUrl).not.toHaveBeenCalled()
    expect(mockedCreateTab).toHaveBeenCalledTimes(1)
    expect(response).toEqual(
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

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a5"],
      openInNewWindow: true,
    })

    expect(mockedCreateWindow).toHaveBeenNthCalledWith(2, {
      url: "https://checkin.example",
      focused: true,
    })
    expect(
      mockedAccountStorage.markAccountAsCustomCheckedIn,
    ).toHaveBeenCalledWith("a5")
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
      }),
    )
  })

  it("falls back to a tab when opening a new check-in window fails", async () => {
    mockedHasWindowsAPI.mockReturnValue(true)
    mockedAccountStorage.getAccountById.mockResolvedValue({
      id: "a6",
      site_url: "https://example.com",
      site_type: "one-api",
      checkIn: {
        customCheckIn: {
          url: "https://checkin.example",
          openRedeemWithCheckIn: false,
        },
      },
    } as any)
    mockedCreateWindow.mockResolvedValueOnce(undefined as any)
    mockedCreateTab.mockResolvedValueOnce({ id: 66 } as any)
    mockedAccountStorage.markAccountAsCustomCheckedIn.mockResolvedValue(true)

    const response = await openExternalCheckInsAndMark({
      accountIds: ["a6"],
      openInNewWindow: true,
    })

    expect(mockedCreateWindow).toHaveBeenCalledWith({
      url: "https://checkin.example",
      focused: true,
    })
    expect(mockedCreateTab).toHaveBeenCalledWith(
      "https://checkin.example",
      true,
    )
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          openedCount: 1,
          markedCount: 1,
        }),
      }),
    )
  })

  it("registers the typed external check-in listener once", () => {
    setupExternalCheckInMessagingListeners()
    setupExternalCheckInMessagingListeners()

    expect(mockOnExternalCheckInMessage).toHaveBeenCalledTimes(1)
    expect(mockOnExternalCheckInMessage).toHaveBeenCalledWith(
      ExternalCheckInMessageTypes.OpenAndMark,
      expect.any(Function),
    )
  })
})
