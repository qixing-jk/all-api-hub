import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { openSettingsTab, pushWithinOptionsPage } from "~/utils/navigation"
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return {
    ...actual,
    openSettingsTab: vi.fn(),
    pushWithinOptionsPage: vi.fn(),
  }
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
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
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

  it("pushes back-stack history when opening account usage settings", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
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
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
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
