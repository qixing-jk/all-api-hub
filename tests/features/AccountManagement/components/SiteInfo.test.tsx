import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import SiteInfo from "~/features/AccountManagement/components/AccountList/SiteInfo"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

const {
  mockOpenAccountBaseUrl,
  mockHandleRefreshAccount,
  createTabMock,
  getLdohSearchUrlForAccountUrlMock,
} = vi.hoisted(() => ({
  mockOpenAccountBaseUrl: vi.fn(),
  mockHandleRefreshAccount: vi.fn(),
  createTabMock: vi.fn(),
  getLdohSearchUrlForAccountUrlMock: vi.fn<
    (accountBaseUrl: string) => string | null
  >(() => null),
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

vi.mock("~/features/LdohSiteLookup/hooks/LdohSiteLookupContext", () => ({
  useLdohSiteLookupContext: () => ({
    getLdohSearchUrlForAccountUrl: getLdohSearchUrlForAccountUrlMock,
  }),
}))

vi.mock("~/utils/browserApi", () => ({
  createTab: createTabMock,
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

  it("shows a warning check-in indicator when the last check-in status detection is not today", async () => {
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date(2026, 0, 2, 10, 0, 0).getTime())

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

    render(
      <SiteInfo
        site={
          {
            id: "acc-ldoh-1",
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
          } as any
        }
      />,
    )

    expect(screen.queryByRole("button", { name: /viewOnLdoh/ })).toBeNull()
  })

  it("shows View on LDOH when match is available", async () => {
    const user = userEvent.setup()
    createTabMock.mockClear()

    const ldohUrl = "https://ldoh.105117.xyz/?q=example.com"
    getLdohSearchUrlForAccountUrlMock.mockReturnValue(ldohUrl)

    render(
      <SiteInfo
        site={
          {
            id: "acc-ldoh-2",
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
          } as any
        }
      />,
    )

    const ldohButton = await screen.findByRole("button", {
      name: /viewOnLdoh/,
    })
    await user.click(ldohButton)

    expect(createTabMock).toHaveBeenCalledWith(ldohUrl, true)
  })
})
