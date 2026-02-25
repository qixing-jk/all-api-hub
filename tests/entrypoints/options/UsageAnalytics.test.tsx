import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accountStorage"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import { render, screen } from "~/tests/test-utils/render"

vi.mock("~/services/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

describe("UsageAnalytics (settings moved)", () => {
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
})
