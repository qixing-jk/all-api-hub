import { describe, expect, it } from "vitest"

import {
  buildAccountBreakdownBarOption,
  buildAccountBreakdownPieOption,
  buildMultiSeriesTrendOption,
} from "~/features/BalanceHistory/reporting/echartsOptions"

describe("BalanceHistory echartsOptions", () => {
  it("builds line-series trend charts and normalizes tooltip values for formatters", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01"],
      series: [{ name: "Alpha", values: [42] }],
      chartType: "line",
      yAxisLabel: "Balance",
      axisLabelFormatter: (value) => `$${value}`,
      valueFormatter: (value, index) => `${index}:${value}`,
    }) as any

    expect(option.series[0]).toMatchObject({
      type: "line",
      showSymbol: true,
      connectNulls: false,
    })
    expect(option.yAxis.axisLabel.formatter(12, 0)).toBe("$12")
    expect(
      option.tooltip.valueFormatter(new Date("2026-01-01T00:00:00Z"), 2),
    ).toBe(`2:${Date.parse("2026-01-01T00:00:00Z")}`)
    expect(option.tooltip.valueFormatter(["7"], 1)).toBe("1:7")
    expect(option.xAxis.axisLabel.color).toBe("var(--chart-axis)")
  })

  it("bridges only internal line gaps using recorded endpoints, without tooltip entries", () => {
    const dayKeys = Array.from(
      { length: 9 },
      (_, index) => `2026-01-0${index + 1}`,
    )
    const values = [null, 0, null, 12, 15, null, null, 5, null]
    const option = buildMultiSeriesTrendOption({
      dayKeys,
      series: [
        { name: "Alpha", values },
        { name: "Beta", values: [null, 2, 3, null] },
      ],
      chartType: "line",
    })

    expect(option.series).toEqual([
      expect.objectContaining({
        name: "Alpha",
        data: values,
        connectNulls: false,
      }),
      expect.objectContaining({ name: "Beta" }),
      expect.objectContaining({
        name: "Alpha",
        type: "line",
        data: [
          ["2026-01-02", 0],
          ["2026-01-04", 12],
          ["2026-01-05", null],
          ["2026-01-05", 15],
          ["2026-01-08", 5],
        ],
        silent: true,
        showSymbol: false,
        tooltip: { show: false, trigger: "none" },
        lineStyle: expect.objectContaining({ type: "dashed" }),
      }),
    ])
  })

  it("builds bar-series trend charts without line-only markers", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01", "2026-01-02", "2026-01-03"],
      series: [{ name: "Bravo", values: [1, null, 2] }],
      chartType: "bar",
    }) as any

    expect(option.series[0]).toMatchObject({
      type: "bar",
      data: [1, null, 2],
      barMaxWidth: 18,
    })
    expect(option.series).toHaveLength(1)
    expect(option.series[0]).not.toHaveProperty("connectNulls")
  })

  it("builds donut charts with zero-filled values and scalar tooltip formatting", () => {
    const option = buildAccountBreakdownPieOption({
      categories: ["Alpha", "Bravo"],
      values: [9],
      valueLabel: "Quota",
      valueFormatter: (value, index) => `${index}:${value}`,
    }) as any

    expect(option.series[0].data).toEqual([
      { name: "Alpha", value: 9 },
      { name: "Bravo", value: 0 },
    ])
    expect(option.tooltip.valueFormatter([12], 0)).toBe("0:12")
    expect(option.legend.textStyle.color).toBe("var(--chart-axis)")
  })

  it("builds horizontal bar charts with formatter hooks and normalized tooltip dates", () => {
    const option = buildAccountBreakdownBarOption({
      categories: ["Alpha"],
      values: [5],
      valueLabel: "Balance",
      axisLabelFormatter: (value) => `${value} USD`,
      valueFormatter: (value, index) => `${index}:${value}`,
    }) as any

    expect(option.yAxis).toMatchObject({
      inverse: true,
      data: ["Alpha"],
    })
    expect(option.xAxis.axisLabel.formatter(5, 0)).toBe("5 USD")
    expect(
      option.tooltip.valueFormatter([new Date("2026-01-02T00:00:00Z")], 1),
    ).toBe(`1:${Date.parse("2026-01-02T00:00:00Z")}`)
  })

  it("falls back to empty series names and omits tooltip formatters when no formatter is provided", () => {
    const trend = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01"],
      series: [{ name: "Alpha", values: [1] }],
      chartType: "line",
    }) as any
    expect(trend.tooltip).toEqual({ trigger: "axis" })

    const pie = buildAccountBreakdownPieOption({
      categories: ["Alpha"],
      values: [1],
    }) as any
    expect(pie.series[0].name).toBe("")
    expect(pie.tooltip).toEqual({ trigger: "item" })

    const bar = buildAccountBreakdownBarOption({
      categories: ["Alpha"],
      values: [1],
    }) as any
    expect(bar.series[0].name).toBe("")
    expect(bar.tooltip).toEqual({ trigger: "item" })
  })
})
