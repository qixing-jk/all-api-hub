import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const { useUserPreferencesContextMock } = vi.hoisted(() => ({
  useUserPreferencesContextMock: vi.fn(),
}))

const echartsInstances: Array<{
  container: HTMLElement
  setOption: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}> = []

vi.mock("~/components/charts/echarts", async () => {
  return {
    echarts: {
      init: vi.fn((container: HTMLElement) => {
        const instance = {
          container,
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

const chartForCard = (key: string) =>
  echartsInstances.find(({ container }) =>
    container.closest('[data-slot="card"]')?.textContent?.includes(key),
  )

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn() },
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
    ...(quotaConsumed > 0 ? { referenceCostUsd: quotaConsumed / 500_000 } : {}),
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
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      referenceCostUsd: 0.000006,
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
      schemaVersion: 3,
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
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      referenceCostUsd: 0.000006,
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelDistribution.title")

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: "usageAnalytics:charts.common.chartType.pie",
        }),
      ).toHaveLength(5),
    )
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
      atIndex(
        screen.getAllByRole("button", {
          name: "usageAnalytics:charts.common.chartType.histogram",
        }),
        0,
      ),
    )

    const lastOption =
      modelDistributionInstance.setOption.mock.calls[
        modelDistributionInstance.setOption.mock.calls.length - 1
      ]?.[0]
    expect((lastOption as any).series?.[0]?.type).toBe("bar")
  })

  it("shows the missing cost state when neither native nor reference costs are available", async () => {
    useUserPreferencesContextMock.mockReturnValue({
      currencyType: "CNY",
    })

    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
    a1.daily["2026-01-01"] = createDailyAggregate(20, 0)
    a1.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...a1.daily["2026-01-01"] },
    }
    attachLatency(a1, "2026-01-01")

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = createDailyAggregate(10, 0)
    a2.dailyByModel["claude-3"] = {
      "2026-01-01": { ...a2.daily["2026-01-01"] },
    }
    attachLatency(a2, "2026-01-01")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 3,
      accounts: { a1, a2 },
    } as any)

    render(<UsageAnalytics />)

    await screen.findByText("usageAnalytics:summary.cost")

    expect(
      screen.getByText("usageAnalytics:summary.unpriced"),
    ).toBeInTheDocument()
  })

  it("shows original-currency settled charges and their partial coverage beside independent token counts", async () => {
    useUserPreferencesContextMock.mockReturnValue({ currencyType: "USD" })
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "A",
        exchange_rate: 99,
        account_info: { username: "A" },
      },
      { id: "a2", site_name: "B", account_info: { username: "B" } },
    ] as any)
    const account = createEmptyUsageHistoryAccountStore()
    account.daily["2026-01-01"] = {
      ...createDailyAggregate(20, 500_000),
      consumption: [
        {
          asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
          amount: {
            status: OBSERVATION_STATUSES.Known,
            value: "3.25",
            observedAt: Date.UTC(2026, 0, 1, 1),
            source: {
              adapter: "fixture",
              operation: "logs",
              contractVersion: "2",
              kind: EVIDENCE_KINDS.Reported,
            },
          },
          scope: {
            subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "a1" },
            authority: "https://example.com",
            projects: { kind: SCOPE_SELECTION_KINDS.All },
            models: { kind: SCOPE_SELECTION_KINDS.All },
            groups: { kind: SCOPE_SELECTION_KINDS.All },
            keys: { kind: SCOPE_SELECTION_KINDS.All },
          },
          window: {
            start: Date.UTC(2026, 0, 1),
            end: Date.UTC(2026, 0, 1, 1),
            timeZone: "UTC",
          },
          settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
          coverage: FINANCIAL_COVERAGE.Partial,
        },
      ],
    }
    const day = "2026-01-01"
    account.dailyByModel["gpt-4"] = { [day]: account.daily[day]! }
    const second = createEmptyUsageHistoryAccountStore()
    const fromAnotherAccount = structuredClone(account.daily[day]!)
    const charge = fromAnotherAccount.consumption![0]!
    charge.scope.subject = {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      accountId: "a2",
    }
    charge.amount.source.adapter = "another-adapter"
    const usdCharge = structuredClone(charge)
    usdCharge.asset = { kind: ASSET_KINDS.Currency, code: "USD" }
    fromAnotherAccount.consumption!.push(usdCharge)
    second.daily[day] = fromAnotherAccount
    second.dailyByModel["gpt-4"] = { [day]: fromAnotherAccount }
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 3,
      accounts: { a1: account, a2: second },
    })
    render(<UsageAnalytics />)
    expect(await screen.findByText(/CNY.*6\.5/)).toBeInTheDocument()
    expect(
      screen.getByText("usageAnalytics:summary.partial"),
    ).toBeInTheDocument()
    expect(screen.getByText(/USD.*3\.25/)).toBeInTheDocument()
    const expectSelectedModelCosts = async (expected: number[]) =>
      waitFor(() => {
        const modelCharts = echartsInstances.filter(({ container }) =>
          container
            .closest('[data-slot="card"]')
            ?.textContent?.includes(
              "usageAnalytics:charts.modelCostDistribution.title",
            ),
        )
        const chart = modelCharts
          .filter(({ container }) => container.isConnected)
          .at(-1)
        const values =
          chart?.setOption.mock.lastCall?.[0]?.series?.[0]?.data.map(
            ({ value }: { value: number }) => value,
          )
        expect(values).toEqual(expected)
      })
    await expectSelectedModelCosts([6.5])
    const modelCostsCard = screen
      .getByText("usageAnalytics:charts.modelCostDistribution.title")
      .closest('[data-slot="card"]')!
    const user = userEvent.setup()
    await user.click(
      within(modelCostsCard as HTMLElement).getByRole("combobox", {
        name: "usageAnalytics:charts.common.costUnit",
      }),
    )
    await user.click(screen.getByRole("option", { name: /^USD$/ }))
    await expectSelectedModelCosts([3.25])
  })

  it("applies legend selection updates coming from the daily overview chart", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.dailyOverview.title")

    let dailyInstance: (typeof echartsInstances)[number] | undefined
    let legendSelectHandler: ((event: unknown) => void) | undefined

    await waitFor(() => {
      dailyInstance = echartsInstances[0]
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
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
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
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.dailyOverview.title")

    await waitFor(() => {
      expect(accountQueries.getAllAccounts).toHaveBeenCalledTimes(1)
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(1)
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "usageAnalytics:actions.refresh" }),
    )

    await waitFor(() => {
      expect(accountQueries.getAllAccounts).toHaveBeenCalledTimes(2)
      expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
    })
  })

  it("ignores redundant breakdown chart type selections", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelDistribution.title")

    await waitFor(() => {
      expect(echartsInstances[1]?.setOption.mock.lastCall?.[0]).toMatchObject({
        series: [
          { type: "pie", data: [expect.objectContaining({ name: "gpt-4" })] },
        ],
      })
    })

    const modelDistributionInstance = echartsInstances[1]!
    const initialSetOptionCalls =
      modelDistributionInstance.setOption.mock.calls.length

    const user = userEvent.setup()
    await user.click(
      atIndex(
        screen.getAllByRole("button", {
          name: "usageAnalytics:charts.common.chartType.pie",
        }),
        0,
      ),
    )

    expect(modelDistributionInstance.setOption.mock.calls).toHaveLength(
      initialSetOptionCalls,
    )
  })

  it("switches the remaining breakdown cards to histogram mode", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelCostDistribution.title")

    const cards = [
      "modelCostDistribution",
      "accountComparison",
      "slowModels",
      "slowTokens",
    ]
    await waitFor(() => {
      for (const card of cards) {
        expect(
          chartForCard(`usageAnalytics:charts.${card}.title`),
        ).toBeDefined()
      }
    })

    const user = userEvent.setup()
    const histogramButtons = screen.getAllByRole("button", {
      name: "usageAnalytics:charts.common.chartType.histogram",
    })

    await user.click(histogramButtons[1]!)
    await user.click(histogramButtons[2]!)
    await user.click(histogramButtons[3]!)
    await user.click(histogramButtons[4]!)

    for (const card of cards) {
      const option = chartForCard(`usageAnalytics:charts.${card}.title`)
        ?.setOption.mock.lastCall?.[0]
      expect(option?.series?.[0]?.type, card).toBe("bar")
    }
  })

  const findTimeHeatmapOption = () =>
    echartsInstances
      .flatMap((instance) =>
        instance.setOption.mock.calls.map((call) => call[0] as any),
      )
      .filter(
        (option) =>
          option?.series?.[0]?.type === "heatmap" &&
          option?.xAxis?.data?.length === 24,
      )
      .at(-1)

  it("plots hourly token totals on the usage-time heatmap", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
    accountStore.hourly["2026-01-01"] = { "09": createDailyAggregate(15, 3) }
    attachLatency(accountStore, "2026-01-01")

    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.usageTimeHeatmap.title")

    // 2026-01-01 is a Thursday, the fourth weekday label after Monday, at the "09" hour.
    await waitFor(() => {
      expect(findTimeHeatmapOption()?.series?.[0]?.data).toContainEqual([
        9, 3, 15,
      ])
    })
  })

  it("focuses and unfocuses a clicked model across related charts", async () => {
    vi.mocked(accountQueries.getAllAccounts).mockResolvedValue([
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
      schemaVersion: 3,
      accounts: { a1: accountStore },
    } as any)

    render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.modelHeatmap.title")

    await waitFor(() => {
      expect(
        chartForCard("usageAnalytics:charts.modelHeatmap.title"),
      ).toBeDefined()
    })

    const modelDistributionInstance = chartForCard(
      "usageAnalytics:charts.modelDistribution.title",
    )
    const modelHeatmapInstance = chartForCard(
      "usageAnalytics:charts.modelHeatmap.title",
    )
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
