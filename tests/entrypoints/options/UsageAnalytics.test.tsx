import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { openSettingsTab } from "~/utils/navigation"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

const { useThemeMock, useUserPreferencesContextMock } = vi.hoisted(() => ({
  useThemeMock: vi.fn(),
  useUserPreferencesContextMock: vi.fn(),
}))

vi.mock("~/components/charts/EChart", () => ({
  EChart: ({ className }: { className?: string }) => (
    <div className={className} data-testid="usage-analytics-chart" />
  ),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return { ...actual, openSettingsTab: vi.fn() }
})
vi.mock("~/utils/navigation/optionsPage", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation/optionsPage")
  return { ...actual, pushWithinOptionsPage: vi.fn() }
})

vi.mock("~/contexts/ThemeContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/ThemeContext")>()
  return {
    ...actual,
    useTheme: () => useThemeMock(),
  }
})

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

describe("UsageAnalytics (settings moved)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useThemeMock.mockReturnValue({ resolvedTheme: "light" })
    useUserPreferencesContextMock.mockReturnValue({ currencyType: "USD" })
  })

  it("does not render sync-now or apply-settings controls", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText("usageAnalytics:empty.title")

    // Controls are now hosted in Basic Settings → Sync tab.
    expect(screen.queryByText("usageAnalytics:actions.syncNow")).toBeNull()
    expect(
      screen.queryByText("usageAnalytics:actions.applySettings"),
    ).toBeNull()
  })

  it("shows a recoverable load error instead of presenting unknown stored data as empty", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([])
    vi.mocked(usageHistoryStorage.getStore)
      .mockRejectedValueOnce(new Error("Unsupported usage history schema"))
      .mockResolvedValueOnce({ schemaVersion: 3, accounts: {} })
    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(
      await screen.findByText("usageAnalytics:messages.error.loadTitle"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("usageAnalytics:empty.title"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("usage-analytics-chart"),
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "common:actions.retry" }))
    expect(
      await screen.findByText("usageAnalytics:empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("usageAnalytics:messages.error.loadTitle"),
    ).not.toBeInTheDocument()
  })

  it("keeps the last loaded metrics visible and explains a failed reload", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
      buildSiteAccount({ id: "a" }),
    ])
    const account = createEmptyUsageHistoryAccountStore()
    account.daily["2026-01-01"] = {
      requests: 19,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      referenceCostUsd: 0.000002,
    }
    vi.mocked(usageHistoryStorage.getStore)
      .mockResolvedValueOnce({ schemaVersion: 3, accounts: { a: account } })
      .mockRejectedValueOnce(new Error("read failed"))
    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(await screen.findByText("19")).toBeInTheDocument()
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "usageAnalytics:actions.refresh" }),
      )
    expect(
      await screen.findByText(
        "usageAnalytics:messages.error.lastLoadedDescription",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("19")).toBeInTheDocument()
    expect(
      screen.queryByText("usageAnalytics:empty.title"),
    ).not.toBeInTheDocument()
  })

  it("shows migrated USD reference costs using the current account exchange rate", async () => {
    useUserPreferencesContextMock.mockReturnValue({ currencyType: "CNY" })
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
      buildSiteAccount({ id: "a", exchange_rate: 7.5 }),
    ])
    const account = createEmptyUsageHistoryAccountStore()
    account.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 8,
      completionTokens: 2,
      totalTokens: 10,
      referenceCostUsd: 2,
    }
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 3,
      accounts: { a: account },
    })
    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(
      await screen.findByText("usageAnalytics:summary.referenceCost"),
    ).toBeInTheDocument()
    expect(screen.getByText("¥15.00")).toBeInTheDocument()
  })

  it("pushes back-stack history when opening account usage settings", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const user = userEvent.setup()
    const emptyCardTitle = await screen.findByText("usageAnalytics:empty.title")
    const emptyCardContent = emptyCardTitle.parentElement
    expect(emptyCardContent).not.toBeNull()

    await user.click(
      within(emptyCardContent as HTMLElement).getByRole("button", {
        name: "usageAnalytics:actions.openAccountUsageSettings",
      }),
    )

    expect(vi.mocked(pushWithinOptionsPage)).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  })

  it("opens account usage settings from the title shortcut", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    render(<UsageAnalytics />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const user = userEvent.setup()
    const pageTitle = await screen.findByRole("heading", {
      name: "usageAnalytics:title",
    })
    const titleActionContainer = pageTitle.parentElement
    expect(titleActionContainer).not.toBeNull()

    await user.click(
      within(titleActionContainer as HTMLElement).getByRole("button", {
        name: "usageAnalytics:actions.openAccountUsageSettings",
      }),
    )

    expect(vi.mocked(openSettingsTab)).toHaveBeenCalledWith("accountUsage", {
      anchor: "usage-history-sync",
      preserveHistory: true,
    })
  })
})
