import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { formatPriceCompact } from "~/services/models/utils/modelPricing"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const { useUserPreferencesContextMock } = vi.hoisted(() => ({
  useUserPreferencesContextMock: vi.fn(),
}))

const echartsInstances: Array<{
  setOption: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}> = []

vi.mock("~/components/charts/echarts", async () => {
  return {
    echarts: {
      init: vi.fn(() => {
        const instance = {
          setOption: vi.fn(),
          resize: vi.fn(),
          dispose: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
        }
        echartsInstances.push(instance)
        return instance
      }),
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

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

describe("UsageAnalytics charts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    echartsInstances.length = 0
    useUserPreferencesContextMock.mockReturnValue({
      currencyType: "USD",
    })
  })

  const createDailyAggregate = (
    totalTokens: number,
    quotaConsumed: number,
    requests = 1,
  ) => ({
    requests,
    promptTokens: Math.max(totalTokens - 5, 0),
    completionTokens: Math.min(5, totalTokens),
    totalTokens,
    quotaConsumed,
  })

  const attachLatency = (
    accountStore: ReturnType<typeof createEmptyUsageHistoryAccountStore>,
    dayKey: string,
  ) => {
    const latency = createEmptyUsageHistoryLatencyAggregate()
    latency.count = 1
    latency.sum = 1
    latency.max = 1
    latency.slowCount = 0
    accountStore.latencyDaily[dayKey] = latency
  }

  it("mounts the ECharts dashboard without throwing", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }

    const latency = createEmptyUsageHistoryLatencyAggregate()
    latency.count = 1
    latency.sum = 1
    latency.max = 1
    latency.slowCount = 0
    accountStore.latencyDaily["2026-01-01"] = latency

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)

    expect(
      await screen.findByText("usageAnalytics:charts.dailyOverview.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("usageAnalytics:charts.modelDistribution.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("usageAnalytics:charts.latencyTrend.title"),
    ).toBeInTheDocument()
  })

  it("defaults breakdown charts to pie and allows switching to histogram", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }

    const latency = createEmptyUsageHistoryLatencyAggregate()
    latency.count = 1
    latency.sum = 1
    latency.max = 1
    latency.slowCount = 0
    accountStore.latencyDaily["2026-01-01"] = latency

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelDistribution.title")

    expect(
      screen.getAllByRole("button", {
        name: "usageAnalytics:charts.common.chartType.pie",
      }),
    ).toHaveLength(5)
    expect(
      screen.getAllByRole("button", {
        name: "usageAnalytics:charts.common.chartType.histogram",
      }),
    ).toHaveLength(5)

    // The first breakdown card is "Model distribution" and is mounted after the daily overview chart.
    await waitFor(() => {
      expect(echartsInstances[1]).toBeDefined()
    })
    const modelDistributionInstance = echartsInstances[1]!
    const initialOption = modelDistributionInstance.setOption.mock
      .calls[0]?.[0] as any
    expect(initialOption.series?.[0]?.type).toBe("pie")

    const user = userEvent.setup()
    await user.click(
      screen.getAllByRole("button", {
        name: "usageAnalytics:charts.common.chartType.histogram",
      })[0],
    )

    const lastOption =
      modelDistributionInstance.setOption.mock.calls[
        modelDistributionInstance.setOption.mock.calls.length - 1
      ]?.[0]
    expect((lastOption as any).series?.[0]?.type).toBe("bar")
  })

  it("formats summary cost with per-account exchange rates when currency is not USD", async () => {
    useUserPreferencesContextMock.mockReturnValue({
      currencyType: "CNY",
    })

    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
      {
        id: "a2",
        site_name: "Site B",
        account_info: {
          username: "User B",
        },
      },
    ] as any)

    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = createDailyAggregate(20, 5)
    a1.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...a1.daily["2026-01-01"] },
    }
    attachLatency(a1, "2026-01-01")

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = createDailyAggregate(10, 3)
    a2.dailyByModel["claude-3"] = {
      "2026-01-01": { ...a2.daily["2026-01-01"] },
    }
    attachLatency(a2, "2026-01-01")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1, a2 },
    } as any)

    render(<UsageAnalytics />)

    await screen.findByText("usageAnalytics:summary.cost")

    const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const expectedCost =
      (5 / conversionFactor) * 7.2 +
      (3 / conversionFactor) * UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

    expect(
      screen.getByText(formatPriceCompact(expectedCost, "CNY")),
    ).toBeInTheDocument()
  })

  it("applies legend selection updates coming from the daily overview chart", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = createDailyAggregate(15, 3)
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    attachLatency(accountStore, "2026-01-01")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.dailyOverview.title")

    const dailyInstance = echartsInstances[0]
    let legendSelectHandler: ((event: unknown) => void) | undefined

    await waitFor(() => {
      legendSelectHandler = dailyInstance?.on.mock.calls.find(
        ([eventName]) => eventName === "legendselectchanged",
      )?.[1] as ((event: unknown) => void) | undefined

      expect(legendSelectHandler).toBeTypeOf("function")
    })

    await act(async () => {
      legendSelectHandler?.({
        selected: {
          "usageAnalytics:charts.dailyOverview.series.requests": false,
        },
      })
    })

    await waitFor(() => {
      const latestOption = dailyInstance?.setOption.mock.calls[
        dailyInstance.setOption.mock.calls.length - 1
      ]?.[0] as any

      expect(latestOption?.legend?.selected).toEqual({
        "usageAnalytics:charts.dailyOverview.series.requests": false,
      })
    })
  })

  it("shows the empty reminder instead of charts when there are no available usage days", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: createEmptyUsageHistoryAccountStore() },
    } as any)

    render(<UsageAnalytics />)

    expect(
      await screen.findByText("usageAnalytics:empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("usageAnalytics:charts.dailyOverview.title"),
    ).toBeNull()
  })

  it("reloads account and usage-history data when refresh is clicked", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = createDailyAggregate(15, 3)
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    attachLatency(accountStore, "2026-01-01")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.dailyOverview.title")

    await waitFor(() => {
      expect(accountStorage.getAllAccounts).toHaveBeenCalledTimes(1)
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(1)
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "usageAnalytics:actions.refresh" }),
    )

    await waitFor(() => {
      expect(accountStorage.getAllAccounts).toHaveBeenCalledTimes(2)
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
    })
  })

  it("ignores redundant breakdown chart type selections", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    for (let day = 1; day <= 10; day += 1) {
      const dayKey = `2026-01-${String(day).padStart(2, "0")}`
      accountStore.daily[dayKey] = createDailyAggregate(15 + day, 3)
      accountStore.dailyByModel["gpt-4"] ??= {}
      accountStore.dailyByModel["gpt-4"][dayKey] = {
        ...accountStore.daily[dayKey],
      }
      attachLatency(accountStore, dayKey)
    }

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelDistribution.title")

    await waitFor(() => {
      expect(echartsInstances[1]).toBeDefined()
    })

    const modelDistributionInstance = echartsInstances[1]!
    const initialSetOptionCalls =
      modelDistributionInstance.setOption.mock.calls.length

    const user = userEvent.setup()
    await user.click(
      screen.getAllByRole("button", {
        name: "usageAnalytics:charts.common.chartType.pie",
      })[0],
    )

    expect(modelDistributionInstance.setOption.mock.calls).toHaveLength(
      initialSetOptionCalls,
    )
  })

  it("switches the remaining breakdown cards to histogram mode", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = createDailyAggregate(20, 5)
    accountStore.daily["2026-01-02"] = createDailyAggregate(12, 3)
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.dailyByModel["claude-3"] = {
      "2026-01-02": { ...accountStore.daily["2026-01-02"] },
    }
    attachLatency(accountStore, "2026-01-01")
    attachLatency(accountStore, "2026-01-02")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelCostDistribution.title")

    await waitFor(() => {
      expect(echartsInstances[9]).toBeDefined()
    })

    const user = userEvent.setup()
    const histogramButtons = screen.getAllByRole("button", {
      name: "usageAnalytics:charts.common.chartType.histogram",
    })

    await user.click(histogramButtons[1]!)
    await user.click(histogramButtons[2]!)
    await user.click(histogramButtons[3]!)
    await user.click(histogramButtons[4]!)

    const modelCostDistributionOption = echartsInstances[2]!.setOption.mock
      .calls[echartsInstances[2]!.setOption.mock.calls.length - 1]?.[0] as any
    const accountComparisonOption = echartsInstances[3]!.setOption.mock.calls[
      echartsInstances[3]!.setOption.mock.calls.length - 1
    ]?.[0] as any
    const slowModelsOption = echartsInstances[8]!.setOption.mock.calls[
      echartsInstances[8]!.setOption.mock.calls.length - 1
    ]?.[0] as any
    const slowTokensOption = echartsInstances[9]!.setOption.mock.calls[
      echartsInstances[9]!.setOption.mock.calls.length - 1
    ]?.[0] as any

    expect(modelCostDistributionOption.series?.[0]?.type).toBe("bar")
    expect(accountComparisonOption.series?.[0]?.type).toBe("bar")
    expect(slowModelsOption.series?.[0]?.type).toBe("bar")
    expect(slowTokensOption.series?.[0]?.type).toBe("bar")
  })

  it("focuses and unfocuses a clicked model across related charts", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: {
          username: "User A",
        },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = createDailyAggregate(15, 3)
    accountStore.daily["2026-01-02"] = createDailyAggregate(20, 4)
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.dailyByModel["claude-3"] = {
      "2026-01-02": { ...accountStore.daily["2026-01-02"] },
    }
    attachLatency(accountStore, "2026-01-01")
    attachLatency(accountStore, "2026-01-02")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelHeatmap.title")

    await waitFor(() => {
      expect(echartsInstances[5]).toBeDefined()
    })

    const modelDistributionInstance = echartsInstances[1]
    const modelHeatmapInstance = echartsInstances[5]
    const clickHandler = modelDistributionInstance?.on.mock.calls.find(
      ([eventName]) => eventName === "click",
    )?.[1]

    expect(clickHandler).toBeTypeOf("function")

    await act(async () => {
      clickHandler?.({ name: "gpt-4" })
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          "usageAnalytics:charts.latencyHistogram.title · gpt-4",
        ),
      ).toBeInTheDocument()

      const focusedHeatmapOption = modelHeatmapInstance?.setOption.mock.calls[
        modelHeatmapInstance.setOption.mock.calls.length - 1
      ]?.[0] as any

      expect(focusedHeatmapOption?.yAxis?.data).toEqual(["gpt-4"])
    })

    await act(async () => {
      clickHandler?.({ name: "gpt-4" })
    })

    await waitFor(() => {
      expect(
        screen.getByText("usageAnalytics:charts.latencyHistogram.title"),
      ).toBeInTheDocument()
      expect(
        screen.queryByText(
          "usageAnalytics:charts.latencyHistogram.title · gpt-4",
        ),
      ).toBeNull()

      const unfocusedHeatmapOption = modelHeatmapInstance?.setOption.mock.calls[
        modelHeatmapInstance.setOption.mock.calls.length - 1
      ]?.[0] as any

      expect(unfocusedHeatmapOption?.yAxis?.data).toEqual(["claude-3", "gpt-4"])
    })
  })
})
