import { describe, expect, it } from "vitest"

import { applyChartColors, CHART_COLORS } from "~/components/charts/chartColors"
import type { EChartsOption } from "~/components/charts/echarts"

describe("chart color contract", () => {
  it("resolves nested color properties without rewriting data, callbacks or explicit status colors", () => {
    const formatter = (value: unknown) => String(value)
    const option: EChartsOption = {
      xAxis: {
        data: [CHART_COLORS.axis],
        axisLabel: { color: CHART_COLORS.axis, formatter },
      },
      yAxis: { splitLine: { lineStyle: { color: CHART_COLORS.grid } } },
      series: [{ type: "bar", data: [1], itemStyle: { color: "#ff0000" } }],
      visualMap: {
        inRange: { color: [CHART_COLORS.heatmapLow, CHART_COLORS.heatmapHigh] },
      },
    }
    const colors = {
      [CHART_COLORS.axis]: "rgb(100, 100, 100)",
      [CHART_COLORS.grid]: "rgb(220, 220, 220)",
      [CHART_COLORS.heatmapLow]: "rgb(255, 240, 240)",
      [CHART_COLORS.heatmapHigh]: "rgb(180, 0, 0)",
      [CHART_COLORS.surface]: "rgb(250, 245, 230)",
      [CHART_COLORS.foreground]: "rgb(40, 30, 20)",
    }
    const resolved = applyChartColors(option, colors)
    expect(resolved).toMatchObject({
      xAxis: {
        data: [CHART_COLORS.axis],
        axisLabel: { color: colors[CHART_COLORS.axis], formatter },
      },
      yAxis: { splitLine: { lineStyle: { color: colors[CHART_COLORS.grid] } } },
      series: [{ itemStyle: { color: "#ff0000" } }],
      visualMap: {
        inRange: {
          color: [
            colors[CHART_COLORS.heatmapLow],
            colors[CHART_COLORS.heatmapHigh],
          ],
        },
      },
      tooltip: {
        backgroundColor: colors[CHART_COLORS.surface],
        textStyle: { color: colors[CHART_COLORS.foreground] },
      },
    })
    expect(option.xAxis).toMatchObject({
      axisLabel: { color: CHART_COLORS.axis },
    })
  })

  it("preserves explicit tooltip formatting and caller palettes", () => {
    const formatter = () => "formatted"
    const option: EChartsOption = {
      color: ["#123456"],
      tooltip: [{ formatter, backgroundColor: "#abcdef" }],
    }
    expect(applyChartColors(option, {})).toMatchObject({
      color: ["#123456"],
      tooltip: [{ formatter, backgroundColor: "#abcdef" }],
    })
  })
})
