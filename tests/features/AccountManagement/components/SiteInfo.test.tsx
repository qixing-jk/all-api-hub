import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import SiteInfo from "~/features/AccountManagement/components/AccountList/SiteInfo"
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
  }
})

const {
  accountActionsScenario,
  accountDataScenario,
  toastErrorMock,
  toastSuccessMock,
  mockOpenAccountBaseUrl,
  mockHandleRefreshAccount,
  mockHandleMarkCustomCheckInAsCheckedIn,
  mockOpenCheckInAndRedeem,
  mockOpenCheckInPage,
  mockOpenCustomCheckInPage,
  mockOpenSettingsTab,
  createTabMock,
  getLdohSearchUrlForAccountUrlMock,
} = vi.hoisted(() => ({
  accountActionsScenario: {
    refreshingAccountId: null as string | null,
  },
  accountDataScenario: {
    detectedSiteAccounts: [] as Array<{ id: string }>,
    isPinFeatureEnabled: false,
    isAccountPinned: vi.fn(() => false),
    togglePinAccount: vi.fn(),
  },
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  mockOpenAccountBaseUrl: vi.fn(),
  mockHandleRefreshAccount: vi.fn(),
  mockHandleMarkCustomCheckInAsCheckedIn: vi.fn(),
  mockOpenCheckInAndRedeem: vi.fn(),
  mockOpenCheckInPage: vi.fn(),
  mockOpenCustomCheckInPage: vi.fn(),
  mockOpenSettingsTab: vi.fn().mockResolvedValue(undefined),
  createTabMock: vi.fn(),
  getLdohSearchUrlForAccountUrlMock: vi.fn<
    (accountBaseUrl: string) => string | null
  >(() => null),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    detectedAccount: null,
    detectedSiteAccounts: accountDataScenario.detectedSiteAccounts,
    isAccountPinned: accountDataScenario.isAccountPinned,
    togglePinAccount: accountDataScenario.togglePinAccount,
    isPinFeatureEnabled: accountDataScenario.isPinFeatureEnabled,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleRefreshAccount: mockHandleRefreshAccount,
    refreshingAccountId: accountActionsScenario.refreshingAccountId,
    handleMarkCustomCheckInAsCheckedIn: mockHandleMarkCustomCheckInAsCheckedIn,
  }),
}))

vi.mock("~/features/LdohSiteLookup/hooks/LdohSiteLookupContext", () => ({
  useLdohSiteLookupContext: () => ({
    getLdohSearchUrlForAccountUrl: getLdohSearchUrlForAccountUrlMock,
  }),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    createTab: createTabMock,
  }
})

vi.mock("~/utils/navigation", () => ({
  openAccountBaseUrl: mockOpenAccountBaseUrl,
  openCheckInAndRedeem: mockOpenCheckInAndRedeem,
  openCheckInPage: mockOpenCheckInPage,
  openCustomCheckInPage: mockOpenCustomCheckInPage,
  openSettingsTab: mockOpenSettingsTab,
}))

const buildSite = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "acc-1",
    disabled: false,
    name: "Site",
    username: "user",
    baseUrl: "https://example.com",
    siteType: "test",
    token: "token",
    userId: 1,
    authType: "access_token",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: "healthy" },
    checkIn: { enableDetection: false },
    ...overrides,
  }) as any

describe("SiteInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accountDataScenario.detectedSiteAccounts = []
    accountDataScenario.isPinFeatureEnabled = false
    accountDataScenario.isAccountPinned.mockReset()
    accountDataScenario.isAccountPinned.mockReturnValue(false)
    accountDataScenario.togglePinAccount.mockReset()
    accountActionsScenario.refreshingAccountId = null
    getLdohSearchUrlForAccountUrlMock.mockReturnValue(null)
  })

  it("shows a disabled badge and still opens the site URL", async () => {
    const user = userEvent.setup()

    render(<SiteInfo site={buildSite({ disabled: true })} />)

    expect(
      await screen.findByText("account:list.site.disabled"),
    ).toBeInTheDocument()

    const siteLinkButton = await screen.findByRole("button", { name: "Site" })

    // Regression: The link button must be able to shrink/truncate so it doesn't overlap the row action buttons.
    expect(siteLinkButton).toHaveClass("flex-1")
    expect(siteLinkButton).toHaveClass("shrink")
    expect(siteLinkButton).not.toHaveClass("w-full")

    await user.click(siteLinkButton)
    expect(mockOpenAccountBaseUrl).toHaveBeenCalledTimes(1)
    expect(mockOpenAccountBaseUrl).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com" }),
    )
  })

  it("renders a formatted created-time row", () => {
    const createdAt = new Date(2026, 0, 2, 3, 4, 5).getTime()
    const expected = formatLocaleDateTime(
      createdAt,
      "common:labels.notAvailable",
    )

    render(
      <SiteInfo site={buildSite({ created_at: createdAt })} showCreatedAt />,
    )

    expect(
      screen.getByText(`account:list.header.createdAt: ${expected}`),
    ).toBeInTheDocument()
    expect(
      screen.getByTitle(`account:list.header.createdAt: ${expected}`),
    ).toBeInTheDocument()
  })

  it("falls back when created time is unavailable", () => {
    render(<SiteInfo site={buildSite({ created_at: 0 })} showCreatedAt />)

    expect(
      screen.getByText(
        "account:list.header.createdAt: common:labels.notAvailable",
      ),
    ).toBeInTheDocument()
  })

  it("hides created time when created-time sorting is not active", () => {
    render(<SiteInfo site={buildSite({ created_at: 123 })} />)

    expect(
      screen.queryByText(/account:list.header.createdAt:/),
    ).not.toBeInTheDocument()
  })

  it("shows a warning check-in indicator when the last check-in status detection is not today", async () => {
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date(2026, 0, 2, 10, 0, 0).getTime())

    try {
      mockHandleRefreshAccount.mockClear()

      render(
        <SiteInfo
          site={buildSite({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: new Date(2026, 0, 1, 12, 0, 0).getTime(),
              },
            },
          })}
        />,
      )

      const staleStatusButton = await screen.findByRole("button", {
        name: "account:list.site.checkInStatusOutdated",
      })
      expect(staleStatusButton).toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: "account:list.site.checkedInToday",
        }),
      ).not.toBeInTheDocument()

      fireEvent.click(staleStatusButton)

      expect(mockHandleRefreshAccount).toHaveBeenCalledTimes(1)
      expect(mockHandleRefreshAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        true,
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("shows the normal check-in indicator when status was detected today", async () => {
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date(2026, 0, 2, 10, 0, 0).getTime())

    try {
      render(
        <SiteInfo
          site={buildSite({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: false,
                lastDetectedAt: new Date(2026, 0, 2, 9, 0, 0).getTime(),
              },
            },
          })}
        />,
      )

      expect(
        await screen.findByRole("button", {
          name: "account:list.site.notCheckedInToday",
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: "account:list.site.checkInStatusOutdated",
        }),
      ).not.toBeInTheDocument()
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("hides View on LDOH when no match is available", async () => {
    getLdohSearchUrlForAccountUrlMock.mockReturnValue(null)

    render(<SiteInfo site={buildSite({ id: "acc-ldoh-1" })} />)

    expect(screen.queryByRole("button", { name: /viewOnLdoh/ })).toBeNull()
  })

  it("shows View on LDOH when match is available", async () => {
    const user = userEvent.setup()
    createTabMock.mockClear()

    const ldohUrl = "https://ldoh.105117.xyz/?q=example.com"
    getLdohSearchUrlForAccountUrlMock.mockReturnValue(ldohUrl)

    render(<SiteInfo site={buildSite({ id: "acc-ldoh-2" })} />)

    const ldohButton = await screen.findByRole("button", {
      name: /viewOnLdoh/,
    })
    await user.click(ldohButton)

    expect(createTabMock).toHaveBeenCalledWith(ldohUrl, true)
  })

  it("opens the related settings tab from the health reason tooltip while preserving return history", async () => {
    const user = userEvent.setup()

    render(
      <SiteInfo
        site={buildSite({
          health: {
            status: "warning",
            code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
            reason: "Permission required",
          },
        })}
      />,
    )

    await user.hover(
      screen.getByRole("button", {
        name: "account:list.site.refreshHealthStatus",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "Permission required",
      }),
    )

    expect(mockOpenSettingsTab).toHaveBeenCalledWith("permissions", {
      preserveHistory: true,
    })
  })

  it("shows a toast when opening the related settings tab fails", async () => {
    const user = userEvent.setup()
    mockOpenSettingsTab.mockRejectedValueOnce(new Error("settings page failed"))

    render(
      <SiteInfo
        site={buildSite({
          health: {
            status: "warning",
            code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
            reason: "Permission required",
          },
        })}
      />,
    )

    await user.hover(
      screen.getByRole("button", {
        name: "account:list.site.refreshHealthStatus",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "Permission required",
      }),
    )

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("settings page failed")
    })
  })

  it("renders current-site metadata, highlighted fragments, and supports unpinning", async () => {
    const user = userEvent.setup()

    accountDataScenario.detectedSiteAccounts = [{ id: "acc-current" }]
    accountDataScenario.isPinFeatureEnabled = true
    accountDataScenario.isAccountPinned.mockReturnValue(true)
    accountDataScenario.togglePinAccount.mockResolvedValue(true)

    render(
      <SiteInfo
        site={buildSite({
          id: "acc-current",
          name: "Example Site",
          username: "alice",
          notes: "Remember this account",
          tags: ["vip", "ops"],
          checkIn: {
            enableDetection: false,
            customCheckIn: {
              url: "https://example.com/checkin",
              redeemUrl: "https://example.com/redeem",
            },
          },
        })}
        highlights={{
          name: [
            { text: "Example", highlighted: true },
            { text: " Site", highlighted: false },
          ],
          username: [{ text: "alice", highlighted: true }],
          baseUrl: [{ text: "https://example.com", highlighted: true }],
          customCheckInUrl: [
            { text: "https://example.com/checkin", highlighted: true },
          ],
          customRedeemUrl: [
            { text: "https://example.com/redeem", highlighted: true },
          ],
          tags: [{ text: "vip, ops", highlighted: true }],
        }}
      />,
    )

    expect(
      await screen.findByText("account:list.site.currentSite"),
    ).toBeInTheDocument()
    expect(screen.getByTitle("Remember this account")).toBeInTheDocument()
    expect(screen.getByTitle("vip, ops")).toBeInTheDocument()
    expect(screen.getByTitle("https://example.com")).toBeInTheDocument()
    expect(screen.getByTitle("https://example.com/checkin")).toBeInTheDocument()
    expect(screen.getByTitle("https://example.com/redeem")).toBeInTheDocument()
    expect(document.querySelectorAll("mark")).toHaveLength(6)

    await user.click(
      screen.getByRole("button", { name: "account:actions.unpin" }),
    )

    expect(accountDataScenario.togglePinAccount).toHaveBeenCalledWith(
      "acc-current",
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "messages:toast.success.accountUnpinned",
    )
  })

  it("opens the site check-in page when the provider reports a successful check-in today", async () => {
    const user = userEvent.setup()
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date(2026, 0, 2, 10, 0, 0).getTime())

    try {
      render(
        <SiteInfo
          site={buildSite({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: new Date(2026, 0, 2, 8, 0, 0).getTime(),
              },
            },
          })}
        />,
      )

      await user.click(
        await screen.findByRole("button", {
          name: "account:list.site.checkedInToday",
        }),
      )

      expect(mockOpenCheckInPage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("opens the combined redeem flow for custom check-ins by default", async () => {
    const user = userEvent.setup()

    render(
      <SiteInfo
        site={buildSite({
          checkIn: {
            enableDetection: false,
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: true,
            },
          },
        })}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "account:list.site.checkedInToday",
      }),
    )

    expect(mockHandleMarkCustomCheckInAsCheckedIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(mockOpenCheckInAndRedeem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(mockOpenCustomCheckInPage).not.toHaveBeenCalled()
  })

  it("opens only the custom check-in page when redeem pairing is disabled", async () => {
    const user = userEvent.setup()

    render(
      <SiteInfo
        site={buildSite({
          checkIn: {
            enableDetection: false,
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: false,
              openRedeemWithCheckIn: false,
            },
          },
        })}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "account:list.site.notCheckedInToday",
      }),
    )

    expect(mockHandleMarkCustomCheckInAsCheckedIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(mockOpenCustomCheckInPage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(mockOpenCheckInAndRedeem).not.toHaveBeenCalled()
  })

  it("suppresses check-in actions and health refresh when the account is disabled", async () => {
    const user = userEvent.setup()

    render(
      <SiteInfo
        site={buildSite({
          disabled: true,
          checkIn: {
            enableDetection: true,
            siteStatus: {
              isCheckedInToday: true,
              lastDetectedAt: new Date(2026, 0, 2, 8, 0, 0).getTime(),
            },
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: true,
            },
          },
        })}
      />,
    )

    expect(
      screen.queryByRole("button", {
        name: "account:list.site.checkedInToday",
      }),
    ).not.toBeInTheDocument()

    const healthButton = screen.getByRole("button", {
      name: "account:list.site.refreshHealthStatus",
    })
    expect(healthButton).toHaveClass("cursor-not-allowed")

    await user.click(healthButton)

    expect(mockHandleRefreshAccount).not.toHaveBeenCalled()
  })

  it("does not re-trigger health refresh while the current row is already refreshing", async () => {
    const user = userEvent.setup()

    accountActionsScenario.refreshingAccountId = "acc-refreshing"

    render(
      <SiteInfo
        site={buildSite({
          id: "acc-refreshing",
        })}
      />,
    )

    const healthButton = screen.getByRole("button", {
      name: "account:list.site.refreshHealthStatus",
    })

    expect(healthButton).toHaveClass("animate-pulse")
    await user.click(healthButton)

    expect(mockHandleRefreshAccount).not.toHaveBeenCalled()
  })
})
