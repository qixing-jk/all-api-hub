import type { EChartsOption } from "./echarts"

/** Resolve rem-based appearance sizing into pixels for Canvas and SVG charts. */
export function readChartTextIncrement(element: HTMLElement): number {
  const increment = getComputedStyle(element)
    .getPropertyValue("--text-size-increment")
    .trim()
  const rootSize = parseFloat(
    getComputedStyle(element.ownerDocument.documentElement).fontSize,
  )
  const value = parseFloat(increment)
  return Number.isFinite(value)
    ? value * (increment.endsWith("rem") ? rootSize || 16 : 1)
    : 0
}

/** Apply appearance to chart text without scaling geometry or modifying caller data. */
export function applyChartTypography(
  option: EChartsOption,
  increment: number,
  fontFamily?: string,
): EChartsOption {
  const font = fontFamily ? { fontFamily } : {}
  const resolve = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.map((item) => resolve(item, key))
    if (
      !value ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return value

    const input = value as Record<string, unknown>
    // These are the component defaults in the bundled ECharts version. They
    // override global textStyle, so axis/legend/tooltip defaults need bridging.
    const defaults: Record<string, unknown> = {}
    if (["xAxis", "yAxis"].includes(key)) {
      defaults.axisLabel = {
        ...font,
        fontSize: 12,
        hideOverlap: true,
        ...(key === "xAxis"
          ? {
              alignMinLabel: input.inverse ? "right" : "left",
              alignMaxLabel: input.inverse ? "left" : "right",
            }
          : {}),
      }
    }
    if (["legend", "visualMap"].includes(key))
      defaults.textStyle = { ...font, fontSize: 12 }
    if (key === "tooltip") defaults.textStyle = { ...font, fontSize: 14 }
    const merged = { ...defaults, ...input }
    for (const [styleKey, style] of Object.entries(defaults)) {
      merged[styleKey] = {
        ...(style as Record<string, unknown>),
        ...(input[styleKey] as Record<string, unknown> | undefined),
      }
    }
    return Object.fromEntries(
      Object.entries(merged).map(([childKey, child]) => [
        childKey,
        // Data values and dimensions can have arbitrary user-supplied names.
        ["data", "dataset", "dimensions"].includes(childKey)
          ? child
          : childKey === "fontSize" && typeof child === "number"
            ? child + increment
            : resolve(child, childKey),
      ]),
    )
  }
  return resolve({
    ...option,
    textStyle: { ...font, fontSize: 12, ...option.textStyle },
  }) as EChartsOption
}
