import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { BalanceHistoryMetricMenu } from "~/features/BalanceHistory/reporting/BalanceHistoryMetricMenu"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import { render, screen } from "~~/tests/test-utils/render"

const nativeIncome = {
  key: "native:income:USD",
  label: "Recorded income · USD",
  kind: "income" as const,
  description: "Recorded credits",
  currencyCode: "USD",
}

describe("BalanceHistoryMetricMenu", () => {
  it("offers native activity without duplicate empty archive choices", async () => {
    const user = userEvent.setup()
    render(
      <BalanceHistoryMetricMenu
        title="Trend"
        metric={DAILY_BALANCE_HISTORY_METRICS.Income}
        nativeMetric={nativeIncome}
        nativeMetrics={[nativeIncome]}
        hasReferenceBalance={false}
        currencyType="USD"
        estimatedTodayIncomeEnabled={false}
        onChange={vi.fn()}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "Trend: Recorded income · USD",
      }),
    )
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(1)
    expect(
      screen.getByRole("menuitemradio", { name: nativeIncome.label }),
    ).toBeVisible()
  })

  it("labels the recorded archive separately and selects its explicit route", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <BalanceHistoryMetricMenu
        title="Trend"
        metric={DAILY_BALANCE_HISTORY_METRICS.Income}
        nativeMetric={nativeIncome}
        nativeMetrics={[nativeIncome]}
        hasReferenceBalance={true}
        referenceMetrics={[
          DAILY_BALANCE_HISTORY_METRICS.Balance,
          DAILY_BALANCE_HISTORY_METRICS.Income,
        ]}
        currencyType="USD"
        estimatedTodayIncomeEnabled={false}
        onChange={onChange}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "Trend: Recorded income · USD",
      }),
    )
    expect(
      screen.queryByRole("menuitemradio", {
        name: /balanceHistory:metrics\.outcome/,
      }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("menuitemradio", {
        name: "balanceHistory:metrics.income · balanceHistory:legacy.title",
      }),
    )
    expect(onChange).toHaveBeenCalledWith("reference:income")
  })
})
