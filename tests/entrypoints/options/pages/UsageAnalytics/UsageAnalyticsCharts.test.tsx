import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { render, screen, waitFor } from "~/tests/test-utils/render"

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

describe("UsageAnalytics charts", () => {
  it("mounts the ECharts dashboard without throwing", async () => {
    echartsInstances.length = 0
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
    echartsInstances.length = 0
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
})
