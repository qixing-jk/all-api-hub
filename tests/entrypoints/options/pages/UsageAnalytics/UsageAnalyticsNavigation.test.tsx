import { fireEvent, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accountStorage"
import { createEmptyUsageHistoryAccountStore } from "~/services/usageHistory/core"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import { render, screen } from "~/tests/test-utils/render"
import { navigateWithinOptionsPage } from "~/utils/navigation"

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

vi.mock("~/utils/navigation", async () => {
  const actual =
    await vi.importActual<typeof import("~/utils/navigation")>(
      "~/utils/navigation",
    )
  return {
    ...actual,
    navigateWithinOptionsPage: vi.fn(),
  }
})

describe("UsageAnalytics navigation", () => {
  it("navigates to account usage settings from header", async () => {
    vi.mocked(navigateWithinOptionsPage).mockClear()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)

    const settingsButton = await screen.findByRole("button", {
      name: "usageAnalytics:actions.openAccountUsageSettings",
    })
    fireEvent.click(settingsButton)

    expect(navigateWithinOptionsPage).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  })

  it("shows a settings shortcut in the empty reminder", async () => {
    vi.mocked(navigateWithinOptionsPage).mockClear()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    render(<UsageAnalytics />)

    const emptyCardTitle = await screen.findByText("usageAnalytics:empty.title")
    const emptyCardContent = emptyCardTitle.parentElement
    expect(emptyCardContent).not.toBeNull()

    const settingsButton = within(emptyCardContent as HTMLElement).getByRole(
      "button",
      {
        name: "usageAnalytics:actions.openAccountUsageSettings",
      },
    )
    fireEvent.click(settingsButton)

    expect(navigateWithinOptionsPage).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  })
})
