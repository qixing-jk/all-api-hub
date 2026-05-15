import { fireEvent, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { render, screen } from "~~/tests/test-utils/render"

const { trackProductAnalyticsActionStartedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

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

vi.mock("~/utils/navigation", async () => {
  const actual =
    await vi.importActual<typeof import("~/utils/navigation")>(
      "~/utils/navigation",
    )
  return {
    ...actual,
    pushWithinOptionsPage: vi.fn(),
  }
})

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionStarted: (...args: any[]) =>
      trackProductAnalyticsActionStartedMock(...args),
  }
})

const expectUsageAnalyticsAction = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
  surfaceId: (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS],
) => {
  expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
    actionId,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

describe("UsageAnalytics navigation", () => {
  beforeEach(() => {
    trackProductAnalyticsActionStartedMock.mockReset()
  })

  it("navigates to account usage settings from header", async () => {
    vi.mocked(pushWithinOptionsPage).mockClear()
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

    expect(pushWithinOptionsPage).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
    expectUsageAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenUsageSyncSettings,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader,
    )
  })

  it("shows a settings shortcut in the empty reminder", async () => {
    vi.mocked(pushWithinOptionsPage).mockClear()
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

    expect(pushWithinOptionsPage).toHaveBeenCalledWith("#basic", {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
    expectUsageAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenUsageSyncSettings,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsEmptyState,
    )
  })

  it("keeps refresh and export actions out of started-only click tracking", async () => {
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

    const refreshButton = await screen.findByRole("button", {
      name: "usageAnalytics:actions.refresh",
    })
    fireEvent.click(refreshButton)
    await waitFor(() => {
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "usageAnalytics:actions.export",
      }),
    )
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshUsageAnalyticsData,
      }),
    )
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportUsageAnalyticsData,
      }),
    )
  })
})
