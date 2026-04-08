import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { render, screen } from "~~/tests/test-utils/render"

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
    pushWithinOptionsPage: vi.fn(),
  }
})

describe("UsageAnalytics (settings moved)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not render sync-now or apply-settings controls", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    render(<UsageAnalytics />)

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

    render(<UsageAnalytics />)

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "usageAnalytics:actions.openAccountUsageSettings",
      }),
    )

    expect(vi.mocked(pushWithinOptionsPage)).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  })
})
