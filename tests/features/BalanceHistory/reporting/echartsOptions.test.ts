import { describe, expect, it } from "vitest"

import { BALANCE_HISTORY_TREND_CHART_TYPES } from "~/features/BalanceHistory/contracts"
import {
  buildAccountBreakdownPieOption,
  buildMultiSeriesTrendOption,
} from "~/features/BalanceHistory/reporting/echartsOptions"

describe("BalanceHistory echartsOptions", () => {
  it.each([
    [76.583, null, -2],
    [null, 4500, null],
  ])(
    "keeps isolated native observations visible without bridging gaps: %j",
    (...values) => {
      const option = buildMultiSeriesTrendOption({
        dayKeys: ["first", "gap", "last"],
        series: [{ name: "Native", values }],
        chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
        bridgeGaps: false,
      }) as any
      expect(option.series).toHaveLength(1)
      expect(option.series[0]).toMatchObject({
        showSymbol: true,
        showAllSymbol: true,
        symbol: "circle",
        connectNulls: false,
        data: values,
      })
      expect(option.series[0].symbolSize).toBeGreaterThan(0)
    },
  )
  it("can preserve native unknown days as unbridged gaps", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["a", "b", "c"],
      series: [{ name: "Token", values: [5, null, 3] }],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
      bridgeGaps: false,
    }) as any
    expect(option.series).toHaveLength(1)
    expect(option.series[0].connectNulls).toBe(false)
  })
  it("builds line-series trend charts and normalizes tooltip values for formatters", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01"],
      series: [{ name: "Alpha", values: [42] }],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
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
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
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

  it("shows the observed points on either side of a long gap without joining them", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["a", "b", "c", "d", "e", "f"],
      series: [{ name: "Archive", values: [0, null, null, null, null, 5] }],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
    })
    expect(option.series).toEqual([
      expect.objectContaining({ showAllSymbol: true, connectNulls: false }),
    ])
  })

  it("labels missing tooltip values while preserving recorded zero and exact native amounts", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["a", "b", "c"],
      series: [
        { name: "Archive", values: [0, null, 5] },
        {
          name: "Native",
          values: [null, 0.1, null],
          valueFormatter: () => "0.100000000000001 CNY",
        },
      ],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
      missingValueLabel: "No record that day",
      valueFormatter: (value) => `$${value}`,
    }) as any

    expect(option.tooltip.valueFormatter(NaN, 1)).toBe("No record that day")
    expect(option.tooltip.valueFormatter(0, 0)).toBe("$0")
    expect(option.series[1].tooltip.valueFormatter(NaN, 0)).toBe(
      "No record that day",
    )
    expect(option.series[1].tooltip.valueFormatter(0.1, 1)).toBe(
      "0.100000000000001 CNY",
    )
  })

  it("builds bar-series trend charts without line-only markers", () => {
    const option = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01", "2026-01-02", "2026-01-03"],
      series: [{ name: "Bravo", values: [1, null, 2] }],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Bar,
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

  it("falls back to empty series names and omits tooltip formatters when no formatter is provided", () => {
    const trend = buildMultiSeriesTrendOption({
      dayKeys: ["2026-01-01"],
      series: [{ name: "Alpha", values: [1] }],
      chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
    }) as any
    expect(trend.tooltip).toEqual({ trigger: "axis" })

    const pie = buildAccountBreakdownPieOption({
      categories: ["Alpha"],
      values: [1],
    }) as any
    expect(pie.series[0].name).toBe("")
    expect(pie.tooltip).toEqual({ trigger: "item" })
  })
})

it("retains independent exact tooltip amounts when comparing native account series", () => {
  const option = buildMultiSeriesTrendOption({
    dayKeys: ["2026-01-01"],
    chartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
    bridgeGaps: false,
    series: [
      {
        name: "First",
        values: [0.1],
        valueFormatter: () => "0.100000000000000001 CNY",
      },
      {
        name: "Second",
        values: [0.2],
        valueFormatter: () => "0.200000000000000002 CNY",
      },
    ],
  })
  const plots = option.series as Array<{
    tooltip: { valueFormatter: (value: number, index: number) => string }
  }>
  expect(plots[0]?.tooltip.valueFormatter(0.1, 0)).toBe(
    "0.100000000000000001 CNY",
  )
  expect(plots[1]?.tooltip.valueFormatter(0.2, 0)).toBe(
    "0.200000000000000002 CNY",
  )
})
