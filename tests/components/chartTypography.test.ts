import { describe, expect, it } from "vitest"

import { applyChartTypography } from "~/components/charts/chartTypography"
import type { EChartsOption } from "~/components/charts/echarts"

describe("chart typography", () => {
  it("enlarges library defaults and explicit labels without changing data or geometry", () => {
    const formatter = (value: unknown) => String(value)
    const data = [{ value: 5, name: "fontSize", fontSize: 99 }]
    const option: EChartsOption = {
      xAxis: { type: "category", axisLabel: { formatter } },
      yAxis: [{ type: "value" }],
      legend: { selected: { Example: false } },
      tooltip: { trigger: "item" },
      visualMap: { min: 0, max: 10 },
      series: [
        {
          type: "pie",
          radius: [20, 80],
          data,
          emphasis: { label: { fontSize: 12 } },
        },
      ],
    }
    const enlarged = applyChartTypography(option, 4)
    expect(enlarged).toMatchObject({
      textStyle: { fontSize: 16 },
      xAxis: {
        axisLabel: {
          fontSize: 16,
          formatter,
          hideOverlap: true,
          alignMinLabel: "left",
          alignMaxLabel: "right",
        },
      },
      yAxis: [{ axisLabel: { fontSize: 16 } }],
      legend: { textStyle: { fontSize: 16 }, selected: { Example: false } },
      tooltip: { textStyle: { fontSize: 18 } },
      visualMap: { textStyle: { fontSize: 16 }, min: 0, max: 10 },
      series: [
        { radius: [20, 80], data, emphasis: { label: { fontSize: 16 } } },
      ],
    })
    expect(option.xAxis).not.toHaveProperty("axisLabel.fontSize")
    expect(applyChartTypography(option, 0)).toMatchObject({
      textStyle: { fontSize: 12 },
      series: [{ emphasis: { label: { fontSize: 12 } } }],
    })
  })
})
