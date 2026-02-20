import type { ShareSnapshotPayload } from "./types"
import {
  clamp,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
} from "./utils"

export type ShareSnapshotOverlayLabels = {
  overview: string
  totalBalance: string
  balance: string
  accounts: string
  site: string
  asOf: string
  today: string
  income: string
  outcome: string
  net: string
}

type Rgb = {
  r: number
  g: number
  b: number
}

const SHARE_SNAPSHOT_TEXT_RGB_LIGHT: Rgb = { r: 255, g: 255, b: 255 }
const SHARE_SNAPSHOT_TEXT_RGB_DARK: Rgb = { r: 15, g: 23, b: 42 }

const clampByte = (value: number): number => clamp(Math.round(value), 0, 255)

// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const relativeLuminanceFromRgb = ({ r, g, b }: Rgb): number => {
  const toLinear = (n: number) => {
    const c = clamp(n / 255, 0, 1)
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  const rr = toLinear(r)
  const gg = toLinear(g)
  const bb = toLinear(b)
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
}

const rgbaFromRgb = (rgb: Rgb, alpha: number): string =>
  `rgba(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)}, ${clamp(
    alpha,
    0,
    1,
  )})`

// Prefer a simple, design-friendly heuristic for "contrasting" tone:
// treat backgrounds as "bright" only when luminance is quite high, otherwise
// default to light text (which matches the snapshot's dark aesthetic).
const SHARE_SNAPSHOT_TEXT_LUMINANCE_SWITCH = 0.55

// Keep the watermark visually secondary to the header label.
const SHARE_SNAPSHOT_WATERMARK_FONT_SCALE = 0.82

const pickContrastingTextTone = (
  backgroundLuminance: number,
): "light" | "dark" => {
  const lum = clamp(backgroundLuminance, 0, 1)
  return lum >= SHARE_SNAPSHOT_TEXT_LUMINANCE_SWITCH ? "dark" : "light"
}

const sampleCanvasLuminance = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: Array<{ x: number; y: number }>,
): number | null => {
  let total = 0
  let count = 0

  for (const sample of samples) {
    const x = clamp(Math.round(sample.x), 0, Math.max(0, width - 1))
    const y = clamp(Math.round(sample.y), 0, Math.max(0, height - 1))
    try {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      total += relativeLuminanceFromRgb({
        r: pixel[0] ?? 0,
        g: pixel[1] ?? 0,
        b: pixel[2] ?? 0,
      })
      count += 1
    } catch {
      // Ignore sampling failures (e.g., if canvas readback is restricted).
    }
  }

  return count > 0 ? total / count : null
}

/**
 * Truncates text with an ellipsis to fit within a given max width.
 */
const truncateTextToWidth = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  const safeText = text.trim()
  const safeMaxWidth = Math.max(0, maxWidth)
  if (!safeText || safeMaxWidth <= 0) return ""

  if (ctx.measureText(safeText).width <= safeMaxWidth) return safeText

  const ellipsis = "…"
  const ellipsisWidth = ctx.measureText(ellipsis).width
  if (ellipsisWidth >= safeMaxWidth) return ""

  let left = 0
  let right = safeText.length
  while (left < right) {
    const mid = Math.ceil((left + right) / 2)
    const candidate = `${safeText.slice(0, mid)}${ellipsis}`
    if (ctx.measureText(candidate).width <= safeMaxWidth) {
      left = mid
    } else {
      right = mid - 1
    }
  }

  return `${safeText.slice(0, Math.max(0, left))}${ellipsis}`
}

/**
 * Picks a font size that fits the provided text within maxWidth.
 */
const getFittedFontSize = ({
  ctx,
  text,
  maxWidth,
  fontFamily,
  fontWeight,
  maxFontSize,
  minFontSize,
}: {
  ctx: CanvasRenderingContext2D
  text: string
  maxWidth: number
  fontFamily: string
  fontWeight: number
  maxFontSize: number
  minFontSize: number
}): number => {
  const safeText = text.trim()
  if (!safeText) return Math.max(8, Math.floor(minFontSize))

  const safeMaxWidth = Math.max(1, Math.floor(maxWidth))
  const safeMinFont = Math.max(8, Math.floor(minFontSize))
  const safeMaxFont = Math.max(safeMinFont, Math.floor(maxFontSize))

  let size = safeMaxFont
  while (size > safeMinFont) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`
    if (ctx.measureText(safeText).width <= safeMaxWidth) {
      break
    }
    size -= 1
  }

  ctx.font = `${fontWeight} ${size}px ${fontFamily}`
  while (size > 8 && ctx.measureText(safeText).width > safeMaxWidth) {
    size -= 1
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`
  }

  return Math.max(8, size)
}

/**
 * Draws the share snapshot text overlay (header + hero metric + 2x2 blocks)
 * on top of an already-rendered background.
 *
 * This is shared between the real exporter and dev previews so the typography
 * and positions stay 1:1.
 */
export const drawShareSnapshotOverlay = (
  ctx: CanvasRenderingContext2D,
  {
    payload,
    width,
    height,
    locale,
    watermarkText,
    labels,
  }: {
    payload: ShareSnapshotPayload
    width: number
    height: number
    locale?: string
    watermarkText: string
    labels: ShareSnapshotOverlayLabels
  },
) => {
  const padding = Math.round(width * 0.08)
  const contentX = padding
  const contentW = width - padding * 2

  const sampledLuminance = sampleCanvasLuminance(ctx, width, height, [
    { x: contentX + 24, y: padding + 24 },
    { x: contentX + contentW - 24, y: padding + 24 },
    { x: contentX + 24, y: height * 0.56 },
    { x: contentX + contentW - 24, y: height * 0.56 },
    { x: contentX + 24, y: height * 0.82 },
    { x: contentX + contentW - 24, y: height * 0.82 },
  ])

  const textTone =
    typeof sampledLuminance === "number"
      ? pickContrastingTextTone(sampledLuminance)
      : "light"
  const textRgb =
    textTone === "dark"
      ? SHARE_SNAPSHOT_TEXT_RGB_DARK
      : SHARE_SNAPSHOT_TEXT_RGB_LIGHT
  const textColors = {
    primary: rgbaFromRgb(textRgb, 0.92),
    secondary: rgbaFromRgb(textRgb, 0.78),
    label: rgbaFromRgb(textRgb, 0.86),
    watermark: rgbaFromRgb(textRgb, 0.75),
  } as const

  const fontStack =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

  ctx.save()
  ctx.textBaseline = "top"

  const safeAsOf =
    Number.isFinite(payload.asOf) && payload.asOf > 0
      ? payload.asOf
      : Date.now()
  const asOfDate = new Date(safeAsOf)

  // Header (watermark text only)
  const headerFontSize = Math.round(width * 0.06)
  const headerFont = `600 ${headerFontSize}px ${fontStack}`
  const watermarkFontSize = Math.max(
    8,
    Math.round(headerFontSize * SHARE_SNAPSHOT_WATERMARK_FONT_SCALE),
  )
  const watermarkFont = `600 ${watermarkFontSize}px ${fontStack}`

  const watermarkGap = Math.round(width * 0.01)
  ctx.font = watermarkFont
  const watermarkTextWidth = ctx.measureText(watermarkText).width

  const headerLeftText =
    payload.kind === "overview" ? labels.overview : payload.siteName
  const headerLeftMaxWidth = Math.max(
    0,
    contentW - watermarkTextWidth - watermarkGap,
  )

  const headerBottomY = padding + headerFontSize
  ctx.textBaseline = "bottom"

  ctx.textAlign = "left"
  ctx.font = headerFont
  ctx.fillStyle = textColors.secondary
  ctx.fillText(
    truncateTextToWidth(ctx, headerLeftText, headerLeftMaxWidth),
    contentX,
    headerBottomY,
  )

  ctx.textAlign = "right"
  ctx.font = watermarkFont
  ctx.fillStyle = textColors.watermark
  ctx.fillText(watermarkText, contentX + contentW, headerBottomY)

  ctx.textBaseline = "top"

  // Hero label
  const heroLabelText =
    payload.kind === "overview" ? labels.totalBalance : labels.balance
  const heroLabelFontSize = Math.round(width * 0.038)
  const heroLabelY = padding + headerFontSize + Math.round(height * 0.09)
  ctx.textAlign = "left"
  ctx.font = `600 ${heroLabelFontSize}px ${fontStack}`
  ctx.fillStyle = textColors.label
  ctx.fillText(
    truncateTextToWidth(ctx, heroLabelText, Math.max(0, contentW)),
    contentX,
    heroLabelY,
  )

  // Hero value
  const currencyValue =
    payload.kind === "overview" ? payload.totalBalance : payload.balance
  const primaryValue = formatCurrencyAmount(currencyValue, payload.currencyType)

  const heroMaxFontSize = Math.round(width * 0.18)
  const heroMinFontSize = Math.round(width * 0.12)
  const heroFontSize = getFittedFontSize({
    ctx,
    text: primaryValue,
    maxWidth: contentW,
    fontFamily: fontStack,
    fontWeight: 700,
    maxFontSize: heroMaxFontSize,
    minFontSize: heroMinFontSize,
  })
  const heroY = heroLabelY + heroLabelFontSize + Math.round(height * 0.04)
  ctx.font = `700 ${heroFontSize}px ${fontStack}`
  ctx.fillStyle = textColors.primary
  ctx.fillText(primaryValue, contentX, heroY)

  const todayIncome =
    typeof payload.todayIncome === "number" ? payload.todayIncome : undefined
  const todayOutcome =
    typeof payload.todayOutcome === "number" ? payload.todayOutcome : undefined
  const todayNet =
    typeof payload.todayNet === "number" ? payload.todayNet : undefined

  let heroSectionBottomY = heroY + heroFontSize
  if (
    typeof todayIncome === "number" &&
    typeof todayOutcome === "number" &&
    typeof todayNet === "number"
  ) {
    const netText = `${labels.today} · ${labels.net} ${formatSignedCurrencyAmount(
      todayNet,
      payload.currencyType,
    )}`
    const netFontSize = Math.round(width * 0.032)
    ctx.font = `600 ${netFontSize}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(
      truncateTextToWidth(ctx, netText, contentW),
      contentX,
      heroY + heroFontSize + Math.round(height * 0.02),
    )
    heroSectionBottomY =
      heroY + heroFontSize + Math.round(height * 0.02) + netFontSize
  }

  const toLocaleDate = (date: Date) => {
    try {
      return locale
        ? date.toLocaleDateString(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
        : date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
    } catch {
      return date.toLocaleDateString()
    }
  }

  const asOfDateText = toLocaleDate(asOfDate)

  const blocksTopY = Math.max(
    Math.round(height * 0.62),
    Math.round(heroSectionBottomY + height * 0.075),
  )
  const colGap = Math.round(width * 0.065)
  const rowGap = Math.round(height * 0.17)
  const blockW = (contentW - colGap) / 2

  const blockLabelFont = Math.round(width * 0.032)
  const blockValueFont = Math.round(width * 0.05)
  const lineGap = Math.round(height * 0.02)

  const drawInfoBlock = ({
    x,
    y,
    label,
    value,
  }: {
    x: number
    y: number
    label: string
    value: string
  }) => {
    ctx.textAlign = "left"
    ctx.textBaseline = "top"

    ctx.font = `600 ${blockLabelFont}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(truncateTextToWidth(ctx, label, blockW), x, y)

    ctx.font = `600 ${blockValueFont}px ${fontStack}`
    ctx.fillStyle = textColors.primary
    ctx.fillText(
      truncateTextToWidth(ctx, value, blockW),
      x,
      y + blockLabelFont + lineGap,
    )
  }

  drawInfoBlock({
    x: contentX,
    y: blocksTopY,
    label: payload.kind === "overview" ? labels.accounts : labels.site,
    value:
      payload.kind === "overview"
        ? String(payload.enabledAccountCount)
        : payload.siteName,
  })
  drawInfoBlock({
    x: contentX + blockW + colGap,
    y: blocksTopY,
    label: labels.asOf,
    value: asOfDateText,
  })
  drawInfoBlock({
    x: contentX,
    y: blocksTopY + rowGap,
    label: labels.income,
    value:
      typeof todayIncome === "number"
        ? formatSignedCurrencyAmount(todayIncome, payload.currencyType)
        : "—",
  })
  drawInfoBlock({
    x: contentX + blockW + colGap,
    y: blocksTopY + rowGap,
    label: labels.outcome,
    value:
      typeof todayOutcome === "number"
        ? formatSignedCurrencyAmount(-todayOutcome, payload.currencyType)
        : "—",
  })

  ctx.restore()
}
