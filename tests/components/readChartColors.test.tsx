import { afterEach, describe, expect, it, vi } from "vitest"

import { CHART_COLORS, readChartColors } from "~/components/charts/chartColors"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("browser chart colors", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("converts browser color pixels to sRGB while preserving alpha and falling back to foreground", () => {
    const element = document.createElement("div")
    const axisColor = "oklch(0.6 0.1 200)"
    const shadowColor = "rgba(0, 0, 0, 0.25)"
    const foreground = "rgb(90, 80, 70)"
    element.style.setProperty("--chart-axis", axisColor)
    element.style.setProperty("--chart-shadow", shadowColor)
    element.style.color = foreground

    const pixels: Record<string, number[]> = {
      [axisColor]: [20, 140, 150, 255],
      [shadowColor]: [0, 0, 0, 64],
      [foreground]: [90, 80, 70, 255],
    }
    const context = {
      fillStyle: "",
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn<() => Pick<ImageData, "data">>(),
    }
    context.getImageData.mockImplementation(() => ({
      data: new Uint8ClampedArray(atIndex(pixels, context.fillStyle)),
    }))
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )

    const colors = readChartColors(element)

    expect(colors).toMatchObject({
      [CHART_COLORS.axis]: "rgba(20, 140, 150, 1)",
      [CHART_COLORS.shadow]: `rgba(0, 0, 0, ${64 / 255})`,
      [CHART_COLORS.grid]: "rgba(90, 80, 70, 1)",
      "var(--chart-1)": "rgba(90, 80, 70, 1)",
    })
  })

  it("keeps resolved CSS colors usable when a canvas context is unavailable", () => {
    const element = document.createElement("div")
    element.style.setProperty("--chart-axis", "rgb(10, 20, 30)")
    element.style.color = "rgb(90, 80, 70)"
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)

    expect(readChartColors(element)).toMatchObject({
      [CHART_COLORS.axis]: "rgb(10, 20, 30)",
      [CHART_COLORS.grid]: "rgb(90, 80, 70)",
    })
  })
})
