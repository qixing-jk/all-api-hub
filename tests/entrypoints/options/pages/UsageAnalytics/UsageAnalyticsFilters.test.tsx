import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { fireEvent, render, screen, within } from "~/tests/test-utils/render"

vi.mock("~/components/charts/echarts", async () => {
  const instance = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }

  return {
    echarts: {
      init: vi.fn(() => instance),
      use: vi.fn(),
    },
  }
})

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

describe("UsageAnalytics filters", () => {
  const getFilterContainer = (label: string): HTMLElement => {
    const labelNode = screen.getByText(label)
    const header = labelNode.closest("div")
    const filter = header?.nextElementSibling

    if (!filter || !(filter instanceof HTMLElement)) {
      throw new Error(`Missing TagFilter container for "${label}"`)
    }

    return filter
  }

  it("cascades filters from site to account to token", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: { username: "User A" },
      },
      {
        id: "a2",
        site_name: "Site B",
        exchange_rate: 7.2,
        account_info: { username: "User B" },
      },
    ] as any)

    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }
    a1.dailyByToken["1"] = {
      "2026-01-01": { ...a1.daily["2026-01-01"] },
    }
    a1.tokenNamesById["1"] = "Token A"

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      quotaConsumed: 1,
    }
    a2.dailyByToken["2"] = {
      "2026-01-01": { ...a2.daily["2026-01-01"] },
    }
    a2.tokenNamesById["2"] = "Token B"

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1, a2 },
    } as any)

    render(<UsageAnalytics />)

    await screen.findByText("usageAnalytics:filters.sites")

    const sitesFilter = getFilterContainer("usageAnalytics:filters.sites")
    const accountsFilter = getFilterContainer("usageAnalytics:filters.accounts")
    const tokensFilter = getFilterContainer("usageAnalytics:filters.tokens")

    const siteAButton = await within(sitesFilter).findByRole("button", {
      name: /Site A/,
    })
    fireEvent.click(siteAButton)

    expect(
      within(accountsFilter).queryByRole("button", { name: /Site B/ }),
    ).toBeNull()
    expect(
      await within(tokensFilter).findByRole("button", { name: "Token A (#1)" }),
    ).toBeInTheDocument()
    expect(
      within(tokensFilter).queryByRole("button", { name: "Token B (#2)" }),
    ).toBeNull()

    const accountButton = await within(accountsFilter).findByRole("button", {
      name: /Site A/,
    })
    fireEvent.click(accountButton)

    const allSitesButton = await within(sitesFilter).findByRole("button", {
      name: /usageAnalytics:filters\.allSites/,
    })
    fireEvent.click(allSitesButton)

    const siteBButton = await within(sitesFilter).findByRole("button", {
      name: /Site B/,
    })
    fireEvent.click(siteBButton)

    expect(
      await within(tokensFilter).findByRole("button", { name: "Token B (#2)" }),
    ).toBeInTheDocument()
    expect(
      within(tokensFilter).queryByRole("button", { name: "Token A (#1)" }),
    ).toBeNull()
  })

  it("excludes disabled accounts from the all-accounts view", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: { username: "User A" },
      },
      {
        id: "a2",
        site_name: "Site Disabled",
        exchange_rate: 7.2,
        disabled: true,
        account_info: { username: "User B" },
      },
    ] as any)

    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }
    a1.dailyByToken["1"] = {
      "2026-01-01": { ...a1.daily["2026-01-01"] },
    }
    a1.tokenNamesById["1"] = "Token A"

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      quotaConsumed: 1,
    }
    a2.dailyByToken["2"] = {
      "2026-01-01": { ...a2.daily["2026-01-01"] },
    }
    a2.tokenNamesById["2"] = "Token B"

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1, a2 },
    } as any)

    render(<UsageAnalytics />)

    await screen.findByText("usageAnalytics:filters.sites")

    const sitesFilter = getFilterContainer("usageAnalytics:filters.sites")
    const accountsFilter = getFilterContainer("usageAnalytics:filters.accounts")
    const tokensFilter = getFilterContainer("usageAnalytics:filters.tokens")

    expect(
      await within(sitesFilter).findByRole("button", { name: /Site A/ }),
    ).toBeInTheDocument()
    expect(
      within(sitesFilter).queryByRole("button", { name: /Site Disabled/ }),
    ).toBeNull()

    expect(
      await within(accountsFilter).findByRole("button", { name: /Site A/ }),
    ).toBeInTheDocument()
    expect(
      within(accountsFilter).queryByRole("button", { name: /Site Disabled/ }),
    ).toBeNull()

    expect(
      await within(tokensFilter).findByRole("button", { name: "Token A (#1)" }),
    ).toBeInTheDocument()
    expect(
      within(tokensFilter).queryByRole("button", { name: "Token B (#2)" }),
    ).toBeNull()
  })
})
