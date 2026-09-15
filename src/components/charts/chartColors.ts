import type { EChartsOption } from "./echarts"

/** Symbols keep chart builders pure; the renderer resolves CSS for Canvas. */
export const CHART_COLORS = {
  shadow: "var(--chart-shadow)",
  axis: "var(--chart-axis)",
  grid: "var(--chart-grid)",
  border: "var(--chart-border)",
  foreground: "var(--popover-foreground)",
  surface: "var(--popover)",
  heatmapLow: "var(--chart-heatmap-low)",
  heatmapHigh: "var(--chart-heatmap-high)",
} as const

const SERIES_COLORS = [1, 2, 3, 4, 5].map((index) => `var(--chart-${index})`)

const COLOR_PROPERTIES = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "shadowColor",
  "areaColor",
  "pageIconColor",
  "pageIconInactiveColor",
  "textBorderColor",
  "textShadowColor",
])

/** Read actual sRGB colors: ECharts' color parser cannot consume CSS variables/OKLCH. */
export function readChartColors(element: HTMLElement): Record<string, string> {
  const style = getComputedStyle(element)
  const canvas = element.ownerDocument.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const entries = [...Object.values(CHART_COLORS), ...SERIES_COLORS]
  return Object.fromEntries(
    entries.map((reference) => {
      const variable = reference.slice(4, -1)
      const cssColor = style.getPropertyValue(variable).trim() || style.color
      if (!context) return [reference, cssColor]
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = cssColor
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      return [reference, `rgba(${r}, ${g}, ${b}, ${a / 255})`]
    }),
  )
}

/** Resolve only color properties, preserving data labels, formatters and caller options. */
export function applyChartColors(
  option: EChartsOption,
  colors: Record<string, string>,
): EChartsOption {
  const resolve = (value: unknown, isColor = false): unknown => {
    if (typeof value === "string")
      return isColor ? colors[value] ?? value : value
    if (Array.isArray(value)) return value.map((item) => resolve(item, isColor))
    if (
      !value ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return value
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolve(child, COLOR_PROPERTIES.has(key)),
      ]),
    )
  }

  const tooltipDefaults = {
    backgroundColor: CHART_COLORS.surface,
    borderColor: CHART_COLORS.border,
    textStyle: { color: CHART_COLORS.foreground },
  }
  const tooltips = Array.isArray(option.tooltip)
    ? option.tooltip
    : [option.tooltip ?? {}]
  const tooltip = tooltips.map((item) => ({
    ...tooltipDefaults,
    ...item,
    textStyle: { ...tooltipDefaults.textStyle, ...item.textStyle },
  }))
  return resolve({
    color: SERIES_COLORS,
    ...option,
    textStyle: { color: CHART_COLORS.axis, ...option.textStyle },
    tooltip: Array.isArray(option.tooltip) ? tooltip : tooltip[0],
  }) as EChartsOption
}
