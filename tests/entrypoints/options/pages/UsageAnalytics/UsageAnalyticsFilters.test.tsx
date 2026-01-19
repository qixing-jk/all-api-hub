import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import commonEn from "~/locales/en/common.json"
import usageAnalyticsEn from "~/locales/en/usageAnalytics.json"
import { accountStorage } from "~/services/accountStorage"
import { createEmptyUsageHistoryAccountStore } from "~/services/usageHistory/core"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen } from "~/tests/test-utils/render"

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

vi.mock("~/services/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

describe("UsageAnalytics filters", () => {
  testI18n.addResourceBundle(
    "en",
    "usageAnalytics",
    usageAnalyticsEn,
    true,
    true,
  )
  testI18n.addResourceBundle("en", "common", commonEn, true, true)

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

    await screen.findByText("Sites")

    const siteAButton = await screen.findByRole("button", { name: /Site A/ })
    fireEvent.click(siteAButton)

    expect(screen.queryByRole("button", { name: /User B/ })).toBeNull()
    expect(
      await screen.findByRole("button", { name: "Token A (#1)" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Token B (#2)" })).toBeNull()

    const accountButton = await screen.findByRole("button", { name: /User A/ })
    fireEvent.click(accountButton)

    const allSitesButton = await screen.findByRole("button", {
      name: "All sites",
    })
    fireEvent.click(allSitesButton)

    const siteBButton = await screen.findByRole("button", { name: /Site B/ })
    fireEvent.click(siteBButton)

    expect(
      await screen.findByRole("button", { name: "Token B (#2)" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Token A (#1)" })).toBeNull()
  })
})
