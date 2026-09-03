import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import UsageAnalytics from "~/entrypoints/options/pages/UsageAnalytics"
import { accountQueries as accountStorage } from "~/services/accounts/accountStorage/accountQueries"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/components/charts/EChart", () => ({
  EChart: ({ option, onEvents }: any) => (
    <div
      data-testid="mock-echart"
      data-series-name={String(option?.series?.[0]?.name ?? "")}
      data-y-axis={JSON.stringify(option?.yAxis?.data ?? null)}
    >
      {onEvents?.datazoom ? (
        <>
          <button
            type="button"
            onClick={() =>
              onEvents.datazoom({
                batch: [{ startValue: 9, endValue: 2 }],
              })
            }
          >
            trigger-datazoom-number
          </button>
          <button
            type="button"
            onClick={() =>
              onEvents.datazoom({
                startValue: "2026-01-08",
                endValue: "2026-01-07",
              })
            }
          >
            trigger-datazoom-string
          </button>
          <button
            type="button"
            onClick={() =>
              onEvents.datazoom({
                batch: [{ startValue: null, endValue: undefined }],
              })
            }
          >
            trigger-datazoom-invalid
          </button>
        </>
      ) : null}
      {onEvents?.click ? (
        <>
          <button type="button" onClick={() => onEvents.click({ name: 123 })}>
            trigger-model-click-invalid
          </button>
          <button
            type="button"
            onClick={() => onEvents.click({ name: "gpt-4" })}
          >
            trigger-model-click-gpt-4
          </button>
        </>
      ) : null}
    </div>
  ),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

describe("UsageAnalytics chart interactions", () => {
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

  const getDateInputs = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[]

  const getMockChartBySeriesName = (seriesName: string) => {
    const chart = screen
      .getAllByTestId("mock-echart")
      .find((node) => node.getAttribute("data-series-name") === seriesName)

    if (!chart) {
      throw new Error(`Missing mock chart for series "${seriesName}"`)
    }

    return chart
  }

  it("normalizes datazoom payloads into valid visible date ranges and ignores invalid payloads", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: { username: "User A" },
      },
    ] as any)

    const accountStore = createEmptyUsageHistoryAccountStore()
    for (let day = 1; day <= 10; day += 1) {
      const dayKey = `2026-01-${String(day).padStart(2, "0")}`
      accountStore.daily[dayKey] = {
        requests: 1,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        quotaConsumed: 3,
      }
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

    const { container } = render(<UsageAnalytics />)
    await screen.findByText("usageAnalytics:charts.dailyOverview.title")

    const [startInput, endInput] = getDateInputs(container)
    expect(startInput).toBeDefined()
    expect(endInput).toBeDefined()

    await waitFor(() => {
      expect(startInput?.value).toBe("2026-01-04")
      expect(endInput?.value).toBe("2026-01-10")
    })

    fireEvent.click(
      screen.getByRole("button", { name: "trigger-datazoom-number" }),
    )

    await waitFor(() => {
      expect(startInput?.value).toBe("2026-01-06")
      expect(endInput?.value).toBe("2026-01-10")
    })

    fireEvent.click(
      screen.getByRole("button", { name: "trigger-datazoom-string" }),
    )

    await waitFor(() => {
      expect(startInput?.value).toBe("2026-01-07")
      expect(endInput?.value).toBe("2026-01-08")
    })

    fireEvent.click(
      screen.getByRole("button", { name: "trigger-datazoom-invalid" }),
    )

    await waitFor(() => {
      expect(startInput?.value).toBe("2026-01-07")
      expect(endInput?.value).toBe("2026-01-08")
    })
  })

  it("ignores invalid model clicks and toggles focus for valid model names", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Site A",
        exchange_rate: 7.2,
        account_info: { username: "User A" },
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
    accountStore.daily["2026-01-02"] = {
      requests: 1,
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
      quotaConsumed: 2,
    }
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

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "trigger-model-click-invalid",
      })[0]!,
    )

    expect(
      screen.queryByText(
        "usageAnalytics:charts.latencyHistogram.title · gpt-4",
      ),
    ).toBeNull()

    const modelHeatmap = getMockChartBySeriesName(
      "usageAnalytics:charts.modelHeatmap.series.tokens",
    )

    await waitFor(() => {
      expect(
        [
          ...JSON.parse(modelHeatmap.getAttribute("data-y-axis") ?? "null"),
        ].sort(),
      ).toEqual(["claude-3", "gpt-4"])
    })

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "trigger-model-click-gpt-4",
      })[0]!,
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          "usageAnalytics:charts.latencyHistogram.title · gpt-4",
        ),
      ).toBeInTheDocument()
      expect(
        JSON.parse(modelHeatmap.getAttribute("data-y-axis") ?? "null"),
      ).toEqual(["gpt-4"])
    })

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "trigger-model-click-gpt-4",
      })[0]!,
    )

    await waitFor(() => {
      expect(
        screen.queryByText(
          "usageAnalytics:charts.latencyHistogram.title · gpt-4",
        ),
      ).toBeNull()
      expect(
        [
          ...JSON.parse(modelHeatmap.getAttribute("data-y-axis") ?? "null"),
        ].sort(),
      ).toEqual(["claude-3", "gpt-4"])
    })
  })
})
