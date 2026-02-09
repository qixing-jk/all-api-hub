import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import SiteInfo from "~/features/AccountManagement/components/AccountList/SiteInfo"

const { mockOpenAccountBaseUrl, mockHandleRefreshAccount } = vi.hoisted(() => ({
  mockOpenAccountBaseUrl: vi.fn(),
  mockHandleRefreshAccount: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    detectedAccount: null,
    detectedSiteAccounts: [],
    isAccountPinned: () => false,
    togglePinAccount: vi.fn(),
    isPinFeatureEnabled: false,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleRefreshAccount: mockHandleRefreshAccount,
    refreshingAccountId: null,
    handleMarkCustomCheckInAsCheckedIn: vi.fn(),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openAccountBaseUrl: mockOpenAccountBaseUrl,
  openCheckInAndRedeem: vi.fn(),
  openCheckInPage: vi.fn(),
  openCustomCheckInPage: vi.fn(),
  openSettingsTab: vi.fn(),
}))

describe("SiteInfo", () => {
  it("shows a disabled badge and still opens the site URL", async () => {
    const user = userEvent.setup()

    render(
      <SiteInfo
        site={
          {
            id: "acc-1",
            disabled: true,
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
          } as any
        }
      />,
    )

    expect(screen.getByText("list.site.disabled")).toBeInTheDocument()

    const siteLinkButton = screen.getByRole("button", { name: "Site" })

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

  it("shows a warning check-in indicator when the last check-in status detection is not today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 10, 0, 0))

    try {
      mockHandleRefreshAccount.mockClear()

      render(
        <SiteInfo
          site={
            {
              id: "acc-1",
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
              checkIn: {
                enableDetection: true,
                siteStatus: {
                  isCheckedInToday: true,
                  lastDetectedAt: new Date(2026, 0, 1, 12, 0, 0).getTime(),
                },
              },
            } as any
          }
        />,
      )

      expect(
        screen.getByRole("button", { name: "list.site.checkInStatusOutdated" }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "list.site.checkedInToday" }),
      ).not.toBeInTheDocument()

      fireEvent.click(
        screen.getByRole("button", { name: "list.site.checkInStatusOutdated" }),
      )

      expect(mockHandleRefreshAccount).toHaveBeenCalledTimes(1)
      expect(mockHandleRefreshAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        true,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows the normal check-in indicator when status was detected today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 10, 0, 0))

    try {
      render(
        <SiteInfo
          site={
            {
              id: "acc-1",
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
              checkIn: {
                enableDetection: true,
                siteStatus: {
                  isCheckedInToday: false,
                  lastDetectedAt: new Date(2026, 0, 2, 9, 0, 0).getTime(),
                },
              },
            } as any
          }
        />,
      )

      expect(
        screen.getByRole("button", { name: "list.site.notCheckedInToday" }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: "list.site.checkInStatusOutdated",
        }),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
