import { CURRENCIES } from "~/constants/money"
import {
  displayCashflowAmount,
  selectDisplayCashflowGroups,
} from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  FINANCIAL_COVERAGE,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  formatOverviewShareBalance,
  getShareBalanceDisplayAmounts,
  shareBalanceTitle,
} from "~/services/sharing/shareSnapshots/balanceSummary"
import { SHARE_SNAPSHOT_KINDS } from "~/services/sharing/shareSnapshots/constants"
import { siteDayUsageValues } from "~/services/sharing/shareSnapshots/consumptionSummary"
import {
  SHARE_BALANCE_PURPOSES,
  type ShareSnapshotPayload,
} from "~/services/sharing/shareSnapshots/types"
import {
  clamp,
  clampByte,
  formatSignedCurrencyAmount,
  getShareDisplayCurrency,
  relativeLuminanceFromRgb,
  type Rgb,
} from "~/services/sharing/shareSnapshots/utils"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  getBalanceFundingLabel,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"
import {
  formatAssetAmount,
  formatBalanceAmount,
  getAssetLabel,
} from "~/utils/core/money"
import { t } from "~/utils/i18n/core"

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

const SHARE_SNAPSHOT_TEXT_RGB_LIGHT: Rgb = { r: 255, g: 255, b: 255 }
const SHARE_SNAPSHOT_TEXT_RGB_DARK: Rgb = { r: 15, g: 23, b: 42 }

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
const SHARE_SNAPSHOT_WATERMARK_FONT_SCALE = 0.55

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

  const setFont = (size: number) => {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`
  }

  let low = safeMinFont
  let high = safeMaxFont
  let bestFit = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    setFont(mid)
    if (ctx.measureText(safeText).width <= safeMaxWidth) {
      bestFit = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  let size = bestFit > 0 ? bestFit : safeMinFont
  setFont(size)

  if (ctx.measureText(safeText).width > safeMaxWidth && size > 8) {
    let fallbackLow = 8
    let fallbackHigh = Math.max(8, size - 1)
    let fallbackBestFit = 0

    while (fallbackLow <= fallbackHigh) {
      const mid = Math.floor((fallbackLow + fallbackHigh) / 2)
      setFont(mid)
      if (ctx.measureText(safeText).width <= safeMaxWidth) {
        fallbackBestFit = mid
        fallbackLow = mid + 1
      } else {
        fallbackHigh = mid - 1
      }
    }

    size = fallbackBestFit > 0 ? fallbackBestFit : 8
    setFont(size)
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
  const headerFontSize = Math.round(width * 0.045)
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
    payload.kind === SHARE_SNAPSHOT_KINDS.Overview
      ? labels.overview
      : payload.siteName
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
  const heroLabelText = payload.balanceSummary
    ? shareBalanceTitle(payload.balanceSummary)
    : payload.kind === SHARE_SNAPSHOT_KINDS.Overview
      ? labels.totalBalance
      : labels.balance
  const heroLabelFontSize = Math.round(width * 0.038)
  const heroLabelY = padding + headerFontSize + Math.round(height * 0.065)
  ctx.textAlign = "left"
  ctx.font = `600 ${heroLabelFontSize}px ${fontStack}`
  ctx.fillStyle = textColors.label
  ctx.fillText(
    truncateTextToWidth(ctx, heroLabelText, Math.max(0, contentW)),
    contentX,
    heroLabelY,
  )

  const summary = payload.balanceSummary
  const formatBalance = (amount: Parameters<typeof formatBalanceAmount>[0]) =>
    formatBalanceAmount(
      amount,
      locale,
      getShareDisplayCurrency(payload),
      payload.exchangeRate,
    )
  const entries =
    summary?.purpose === SHARE_BALANCE_PURPOSES.Account
      ? summary.entries.map((entry) => ({
          value: entry.amount
            ? formatBalance(entry.amount)
            : [
                getAssetLabel(entry.asset),
                t("shareSnapshots:financial.unavailable"),
              ]
                .filter(Boolean)
                .join(" · "),
          label: [
            entry.relation === BALANCE_RELATIONS.Component
              ? getBalanceFundingLabel(entry.funding, t)
              : undefined,
            entry.status === OBSERVATION_STATUSES.Stale
              ? t("account:financial.lastKnown")
              : "",
            getBalanceRoleLabel(entry, t),
            entry.allowanceRules?.[0],
          ]
            .filter(Boolean)
            .join(" · "),
        }))
      : [
          ...getShareBalanceDisplayAmounts(
            summary,
            getShareDisplayCurrency(payload),
          ).map((amount) => ({
            value: formatOverviewShareBalance(
              amount,
              summary,
              locale,
              getShareDisplayCurrency(payload),
            ),
            label: summary?.lastKnownCount
              ? t("account:financial.lastKnown")
              : "",
          })),
          ...(summary?.referenceAmount
            ? [
                {
                  value: formatBalance(summary.referenceAmount),
                  label: t("account:financial.lastKnown"),
                },
              ]
            : []),
        ]
  const visibleEntries = entries.slice(0, 3)
  let showCaptionHint =
    entries.length > visibleEntries.length ||
    summary?.purpose === SHARE_BALANCE_PURPOSES.Account ||
    Boolean(
      summary?.duplicateCount ||
      summary?.conflictCount ||
      summary?.potentialDuplicateCount ||
      summary?.manualCount ||
      summary?.lastKnownCount,
    )
  const heroY = heroLabelY + heroLabelFontSize + Math.round(height * 0.023)
  const detailFontSize = Math.round(width * 0.024)
  let heroSectionBottomY = heroY
  const amountFontSize = width * (visibleEntries.length === 1 ? 0.15 : 0.065)

  const colGap = Math.round(width * 0.065)
  const blockW = (contentW - colGap) / 2
  const balanceColumnWidth = visibleEntries.length > 1 ? blockW : contentW
  const balanceLabelHeight = detailFontSize + Math.round(height * 0.005)
  const drawBalanceLabel = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
  ) => {
    ctx.font = `600 ${detailFontSize}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(truncateTextToWidth(ctx, text, maxWidth), x, y)
  }
  const drawBalanceNote = (text: string) => {
    drawBalanceLabel(text, contentX, heroSectionBottomY, contentW)
    heroSectionBottomY += balanceLabelHeight
  }

  // A shared heading describes matching balances without repeating their role.
  const sharedLabel = visibleEntries.find(
    ({ label }, index) =>
      label &&
      visibleEntries.some(
        (entry, other) => other > index && entry.label === label,
      ),
  )?.label
  const balanceGroups = sharedLabel
    ? [
        {
          heading: sharedLabel,
          entries: visibleEntries.filter(({ label }) => label === sharedLabel),
        },
        {
          heading: "",
          entries: visibleEntries.filter(({ label }) => label !== sharedLabel),
        },
      ]
    : [{ heading: "", entries: visibleEntries }]

  for (const { heading, entries } of balanceGroups) {
    if (heading) drawBalanceNote(heading)
    for (let index = 0; index < entries.length; index += 2) {
      const row = entries.slice(index, index + 2)
      const showItemLabels = !heading && row.some(({ label }) => label)
      const valueY =
        heroSectionBottomY + (showItemLabels ? balanceLabelHeight : 0)
      const fontSize = Math.max(
        detailFontSize,
        Math.min(
          ...row.map(({ value }) =>
            getFittedFontSize({
              ctx,
              text: value,
              maxWidth: balanceColumnWidth,
              fontFamily: fontStack,
              fontWeight: 700,
              maxFontSize: amountFontSize,
              minFontSize: detailFontSize,
            }),
          ),
        ),
      )

      row.forEach(({ value, label }, column) => {
        const x = contentX + column * (blockW + colGap)
        if (showItemLabels && label) {
          drawBalanceLabel(label, x, heroSectionBottomY, balanceColumnWidth)
        }
        ctx.font = `700 ${fontSize}px ${fontStack}`
        ctx.fillStyle = textColors.primary
        const fittedValue = truncateTextToWidth(ctx, value, balanceColumnWidth)
        ctx.fillText(fittedValue, x, valueY)
        showCaptionHint ||= fittedValue !== value
      })
      heroSectionBottomY = valueY + fontSize + Math.round(height * 0.015)
    }
  }

  if (!visibleEntries.length) {
    drawBalanceNote(
      t(
        summary
          ? "shareSnapshots:financial.unavailable"
          : "account:financial.legacy",
      ),
    )
  }
  if (summary && summary.coverage !== FINANCIAL_COVERAGE.Complete) {
    heroSectionBottomY += Math.round(height * 0.01)
    const coverage =
      summary.coverage === FINANCIAL_COVERAGE.Partial
        ? t("shareSnapshots:financial.partial")
        : t("shareSnapshots:financial.unknown")
    const included =
      summary.eligibleCount === undefined
        ? ""
        : t("account:financial.coverage", {
            included: summary.includedCount,
            eligible: summary.eligibleCount,
          })
    drawBalanceNote([coverage, included].filter(Boolean).join(" · "))
  }

  const todayIncome =
    typeof payload.todayIncome === "number" ? payload.todayIncome : undefined
  const todayOutcome =
    typeof payload.todayOutcome === "number" ? payload.todayOutcome : undefined
  const todayNet =
    typeof payload.todayNet === "number" ? payload.todayNet : undefined

  const netValue = payload.todayNetAmount
    ? formatAssetAmount(payload.todayNetAmount, locale)
    : !payload.incomeSummary &&
        !payload.consumptionSummary &&
        typeof todayIncome === "number" &&
        typeof todayOutcome === "number" &&
        typeof todayNet === "number"
      ? formatSignedCurrencyAmount(
          todayNet,
          getShareDisplayCurrency(payload) ?? CURRENCIES.USD,
        )
      : undefined
  if (netValue !== undefined) {
    const netText = `${labels.today} · ${labels.net} ${netValue}`
    const netFontSize = Math.round(width * 0.032)
    ctx.font = `600 ${netFontSize}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(
      truncateTextToWidth(ctx, netText, contentW),
      contentX,
      heroSectionBottomY + Math.round(height * 0.02),
    )
    heroSectionBottomY =
      heroSectionBottomY + Math.round(height * 0.02) + netFontSize
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
    Math.round(heroSectionBottomY + height * 0.02),
  )
  const rowGap = Math.round(height * 0.145)

  const blockLabelFont = Math.round(width * 0.026)
  const blockValueFont = Math.round(width * 0.037)
  const lineGap = Math.round(height * 0.012)
  const firstSiteDay = payload.siteDayUsage?.[0]
  const siteDayLabel = [
    firstSiteDay?.costCoverage === FINANCIAL_COVERAGE.Partial
      ? t("account:todayMetricAvailability.partial")
      : undefined,
    firstSiteDay?.lastKnown ? t("account:financial.lastKnown") : undefined,
    t("account:financial.siteDay"),
    firstSiteDay?.reportedDay,
  ]
    .filter(Boolean)
    .join(" · ")

  const drawInfoBlock = ({
    x,
    y,
    label,
    value,
    summary,
    readings,
  }: {
    x: number
    y: number
    label: string
    value: string
    summary?: ShareSnapshotPayload["consumptionSummary"]
    readings?: string[]
  }) => {
    ctx.textAlign = "left"
    ctx.textBaseline = "top"

    ctx.font = `600 ${blockLabelFont}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(truncateTextToWidth(ctx, label, blockW), x, y)

    if (
      readings?.length &&
      !summary?.groups.length &&
      !summary?.references?.length
    ) {
      ctx.font = `600 ${Math.round(width * 0.029)}px ${fontStack}`
      ctx.fillStyle = textColors.primary
      readings
        .slice(0, 2)
        .forEach((reading, index) =>
          ctx.fillText(
            truncateTextToWidth(ctx, reading, blockW),
            x,
            y + blockLabelFont + lineGap + index * height * 0.045,
          ),
        )
      return
    }

    if (summary && (summary.groups.length || summary.references?.length)) {
      // Each tile owns its native observations, independently of the balance hero cap.
      // Keep the asset and uncertainty above the value so truncating digits cannot erase them.
      const observations = [
        ...selectDisplayCashflowGroups(
          summary,
          getShareDisplayCurrency(payload),
        ).map((group) => ({
          displayed: displayCashflowAmount(
            group,
            getShareDisplayCurrency(payload),
          ),
          qualifier:
            group.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete
              ? ""
              : t(
                  group.coverage.status ===
                    ACCOUNT_TODAY_METRIC_STATUSES.Partial
                    ? "account:todayMetricAvailability.partial"
                    : "account:financial.coverageUnknown",
                ),
        })),
        ...(summary.references ?? []).map((reference) => ({
          displayed: {
            asset: {
              kind: ASSET_KINDS.Currency,
              code: getShareDisplayCurrency(payload) ?? CURRENCIES.USD,
            } as const,
            value: String(
              reference.amount[
                getShareDisplayCurrency(payload) ?? CURRENCIES.USD
              ],
            ),
          },
          qualifier: [
            t("account:financial.legacy"),
            reference.lastKnown ? t("account:financial.lastKnown") : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      ]
      observations
        .slice(0, readings?.length ? 1 : 2)
        .forEach(({ displayed, qualifier }, index) => {
          const asset = displayed.asset
          const assetLabel =
            asset.kind === ASSET_KINDS.Currency
              ? asset.code
              : asset.kind === ASSET_KINDS.Crypto
                ? asset.id
                : asset.displayLabel
          const groupY = y + blockLabelFont + lineGap + index * height * 0.06
          ctx.font = `600 ${Math.round(width * 0.02)}px ${fontStack}`
          ctx.fillStyle = textColors.secondary
          ctx.fillText(
            truncateTextToWidth(
              ctx,
              [qualifier, assetLabel].filter(Boolean).join(" · "),
              blockW,
            ),
            x,
            groupY,
          )
          const amount = formatAssetAmount(displayed, locale)
          const fitted = getFittedFontSize({
            ctx,
            text: amount,
            maxWidth: blockW,
            fontFamily: fontStack,
            fontWeight: 600,
            maxFontSize: width * 0.032,
            minFontSize: width * 0.025,
          })
          if (observations.length > (readings?.length ? 1 : 2))
            showCaptionHint = true
          ctx.font = `600 ${Math.max(width * 0.023, fitted)}px ${fontStack}`
          ctx.fillStyle = textColors.primary
          ctx.fillText(
            truncateTextToWidth(ctx, amount, blockW),
            x,
            groupY + height * 0.023,
          )
        })
      if (readings?.length) {
        const groupY = y + blockLabelFont + lineGap + height * 0.06
        ctx.font = `600 ${Math.round(width * 0.02)}px ${fontStack}`
        ctx.fillStyle = textColors.secondary
        ctx.fillText(truncateTextToWidth(ctx, siteDayLabel, blockW), x, groupY)
        ctx.font = `600 ${Math.round(width * 0.029)}px ${fontStack}`
        ctx.fillStyle = textColors.primary
        ctx.fillText(
          truncateTextToWidth(ctx, readings[0]!, blockW),
          x,
          groupY + height * 0.023,
        )
      }
      return
    }
    ctx.font = `600 ${blockValueFont}px ${fontStack}`
    ctx.fillStyle = textColors.primary
    ctx.fillText(
      truncateTextToWidth(
        ctx,
        summary ? t("account:financial.unavailable") : value,
        blockW,
      ),
      x,
      y + blockLabelFont + lineGap,
    )
  }

  drawInfoBlock({
    x: contentX,
    y: blocksTopY,
    label:
      payload.kind === SHARE_SNAPSHOT_KINDS.Overview
        ? labels.accounts
        : labels.site,
    value:
      payload.kind === SHARE_SNAPSHOT_KINDS.Overview
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
    summary: payload.incomeSummary,
    value:
      typeof todayIncome === "number"
        ? formatSignedCurrencyAmount(todayIncome, payload.currencyType)
        : "—",
  })
  drawInfoBlock({
    x: contentX + blockW + colGap,
    y: blocksTopY + rowGap,
    label:
      !payload.consumptionSummary?.groups.length &&
      !payload.consumptionSummary?.references?.length &&
      payload.siteDayUsage?.length
        ? siteDayLabel
        : labels.outcome,
    readings: firstSiteDay
      ? siteDayUsageValues(firstSiteDay, locale)
      : undefined,
    summary: payload.consumptionSummary,
    value:
      typeof todayOutcome === "number"
        ? formatSignedCurrencyAmount(-todayOutcome, payload.currencyType)
        : "—",
  })

  if (
    showCaptionHint ||
    payload.incomeSummary?.groups.length ||
    payload.consumptionSummary?.groups.length ||
    payload.incomeSummary?.references?.length ||
    payload.consumptionSummary?.references?.length ||
    payload.siteDayUsage?.length
  ) {
    // The caption carries the full financial observations and their context.
    ctx.font = `600 ${Math.round(width * 0.02)}px ${fontStack}`
    ctx.fillStyle = textColors.secondary
    ctx.fillText(
      truncateTextToWidth(
        ctx,
        t("shareSnapshots:financial.detailsInCaption"),
        contentW,
      ),
      contentX,
      height - Math.round(height * 0.045),
    )
  }
  ctx.restore()
}
