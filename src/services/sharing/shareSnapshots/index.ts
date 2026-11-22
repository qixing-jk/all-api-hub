import { ACCOUNT_CASHFLOW_METRICS } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import type { AccountAllowanceSnapshot } from "~/services/accounts/allowances"
import type { SiteDayReading } from "~/services/accounts/metrics/accountTodayStats"
import type { getDisplayBalancePortfolio } from "~/services/accounts/metrics/balanceProjection"
import { BALANCE_PURPOSES } from "~/services/accounts/metrics/balanceProjection"
import type { ConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import type { BalanceSnapshot } from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { SHARE_SNAPSHOT_KINDS } from "~/services/sharing/shareSnapshots/constants"
import { drawMeshGradientBackground } from "~/services/sharing/shareSnapshots/meshGradientBackground"
import {
  drawShareSnapshotOverlay,
  type ShareSnapshotOverlayLabels,
} from "~/services/sharing/shareSnapshots/shareSnapshotOverlay"
import type {
  AccountShareSnapshotPayload,
  OverviewShareSnapshotPayload,
  ShareSnapshotExportResult,
  ShareSnapshotPayload,
} from "~/services/sharing/shareSnapshots/types"
import {
  createShareSnapshotSeed,
  formatAsOfTimestamp,
  formatLocalDateStamp,
  formatSignedCurrencyAmount,
  getShareDisplayCurrency,
} from "~/services/sharing/shareSnapshots/utils"
import type {
  AccountUsageSummary,
  CurrencyDisplay,
  CurrencyType,
} from "~/types"
import { downloadBlob } from "~/utils/browser/download"
import { createLogger } from "~/utils/core/logger"
import { formatAssetAmount } from "~/utils/core/money"
import { sanitizeOriginUrl } from "~/utils/core/url"
import i18n, { t } from "~/utils/i18n/core"

import {
  accountShareBalanceSummary,
  publicShareAsset,
  shareBalanceLines,
  shareBalanceTitle,
} from "./balanceSummary"
import {
  getShareNetAmount,
  publicConsumptionSummary,
  publicSiteDayUsage,
  shareConsumptionLines,
  shareSiteDayLines,
} from "./consumptionSummary"

const SHARE_SNAPSHOT_IMAGE = {
  width: 1200,
  height: 1200,
} as const

const APP_WATERMARK_FALLBACK = "All API Hub"

const logger = createLogger("ShareSnapshots")

const getWatermarkText = (): string => {
  const translated = t("ui:app.name")
  return translated && translated !== "ui:app.name"
    ? translated
    : APP_WATERMARK_FALLBACK
}

const getLocale = (): string | undefined => {
  const lng = i18n.language
  return lng && lng !== "cimode"
    ? lng.toLowerCase().replace(/_/g, "-")
    : undefined
}

const resolveOverlayLabels = (): ShareSnapshotOverlayLabels => ({
  overview: t("shareSnapshots:labels.overview"),
  totalBalance: t("shareSnapshots:labels.totalBalance"),
  balance: t("shareSnapshots:labels.balance"),
  accounts: t("shareSnapshots:labels.accounts"),
  site: t("shareSnapshots:labels.site"),
  asOf: t("shareSnapshots:labels.asOf"),
  today: t("shareSnapshots:labels.today"),
  income: t("shareSnapshots:labels.income"),
  outcome: t("shareSnapshots:labels.outcome"),
  net: t("shareSnapshots:labels.net"),
})

const resolveSafeAsOf = (asOf: number | undefined, fallback = Date.now()) =>
  Number.isFinite(asOf) && (asOf ?? 0) > 0 ? (asOf as number) : fallback

const resolveSeed = (
  backgroundSeed: number | undefined,
  createSeed: () => number,
) =>
  Number.isFinite(backgroundSeed) && (backgroundSeed ?? 0) > 0
    ? (backgroundSeed as number)
    : createSeed()

type ShareSnapshotCashflowPayload = {
  siteDayUsage?: ReturnType<typeof publicSiteDayUsage>
  todayNetAmount?: ReturnType<typeof getShareNetAmount>
  incomeSummary?: ReturnType<typeof publicConsumptionSummary>
  consumptionSummary?: ReturnType<typeof publicConsumptionSummary>
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

const applyCashflow = <TPayload extends ShareSnapshotCashflowPayload>(
  payload: TPayload,
  todayIncome: number | undefined,
  todayOutcome: number | undefined,
): TPayload => {
  if (!Number.isFinite(todayIncome) || !Number.isFinite(todayOutcome)) {
    return payload
  }

  const income = todayIncome as number
  const outcome = todayOutcome as number
  const net = income - outcome
  if (!Number.isFinite(net)) {
    return payload
  }

  return {
    ...payload,
    todayIncome: income,
    todayOutcome: outcome,
    todayNet: net,
  }
}

const appendCashflowAndAsOf = (
  lines: string[],
  payload: ShareSnapshotCashflowPayload & {
    currencyType: CurrencyType
    exchangeRate?: number
  },
  labels: ShareSnapshotOverlayLabels,
  asOfText: string,
  currencyType?: CurrencyType,
) => {
  lines.push(
    ...shareSiteDayLines(payload.siteDayUsage, getLocale()),
    ...shareConsumptionLines(
      payload.consumptionSummary,
      getLocale(),
      ACCOUNT_CASHFLOW_METRICS.Consumption,
      currencyType,
      payload.exchangeRate,
    ),
    ...shareConsumptionLines(
      payload.incomeSummary,
      getLocale(),
      ACCOUNT_CASHFLOW_METRICS.Income,
      currencyType,
      payload.exchangeRate,
    ),
  )
  if (payload.todayNetAmount)
    lines.push(
      `${labels.today} · ${labels.net} ${formatAssetAmount(payload.todayNetAmount, getLocale())}`,
    )
  if (
    typeof payload.todayIncome === "number" &&
    typeof payload.todayOutcome === "number" &&
    typeof payload.todayNet === "number"
  ) {
    lines.push(
      `${labels.today}: ${labels.income} ${formatSignedCurrencyAmount(
        payload.todayIncome,
        payload.currencyType,
      )} / ${labels.outcome} ${formatSignedCurrencyAmount(
        -payload.todayOutcome,
        payload.currencyType,
      )} · ${labels.net} ${formatSignedCurrencyAmount(
        payload.todayNet,
        payload.currencyType,
      )}`,
    )
  }

  lines.push(`${labels.asOf}: ${asOfText}`)
}

/**
 * Builds the allowlisted payload for an overview snapshot (aggregated across enabled accounts only).
 */
export const buildOverviewShareSnapshotPayload = ({
  siteDayUsage,
  currencyType,
  currencyDisplay,
  enabledAccountCount,
  totalBalance,
  portfolio,
  consumption,
  income,
  purpose = BALANCE_PURPOSES.Available,
  includeTodayCashflow,
  todayIncome,
  todayOutcome,
  asOf,
  backgroundSeed,
}: {
  currencyType: CurrencyType
  currencyDisplay?: CurrencyDisplay
  enabledAccountCount: number
  totalBalance?: number
  siteDayUsage?: (
    AccountUsageSummary | (SiteDayReading & { exchangeRate?: number })
  )[]
  income?: Pick<
    ConsumptionProjection,
    "groups" | "nativeCoverage" | "references"
  >
  consumption?: Pick<
    ConsumptionProjection,
    "groups" | "nativeCoverage" | "references"
  >
  portfolio?: Pick<
    ReturnType<typeof getDisplayBalancePortfolio>,
    | "amounts"
    | "coverage"
    | "includedCount"
    | "eligibleCount"
    | "duplicateCount"
    | "potentialDuplicateCount"
    | "manualCount"
    | "conflictCount"
  > &
    Partial<
      Pick<
        ReturnType<typeof getDisplayBalancePortfolio>,
        | "usdInCny"
        | "cnyInUsd"
        | "convertedCurrencyTotals"
        | "referenceUsd"
        | "lastKnownCount"
      >
    >
  purpose?: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"]
  includeTodayCashflow: boolean
  todayIncome?: number
  todayOutcome?: number
  asOf?: number
  backgroundSeed?: number
}): OverviewShareSnapshotPayload => {
  const exportTime = Date.now()
  const safeAsOf = resolveSafeAsOf(asOf, exportTime)
  const seed = resolveSeed(backgroundSeed, createShareSnapshotSeed)
  const referenceValue = parseDecimal(totalBalance)

  const payload: OverviewShareSnapshotPayload = {
    ...(includeTodayCashflow && siteDayUsage?.length
      ? {
          siteDayUsage: publicSiteDayUsage(
            siteDayUsage,
            getShareDisplayCurrency({ currencyType, currencyDisplay }),
          ),
        }
      : {}),
    ...(includeTodayCashflow && income
      ? { incomeSummary: publicConsumptionSummary(income) }
      : {}),
    ...(includeTodayCashflow && consumption
      ? { consumptionSummary: publicConsumptionSummary(consumption) }
      : {}),
    kind: SHARE_SNAPSHOT_KINDS.Overview,
    currencyType,
    ...(currencyDisplay === undefined ? {} : { currencyDisplay }),
    enabledAccountCount: Math.max(0, Math.floor(enabledAccountCount)),
    balanceSummary: {
      purpose,
      entries: [],
      amounts:
        portfolio?.amounts.map(({ asset, value }) => ({
          asset: publicShareAsset(asset),
          value,
        })) ?? [],
      ...(portfolio?.usdInCny === undefined
        ? {}
        : { usdInCny: portfolio.usdInCny }),
      ...(portfolio?.cnyInUsd === undefined
        ? {}
        : { cnyInUsd: portfolio.cnyInUsd }),
      ...(portfolio?.convertedCurrencyTotals === undefined
        ? {}
        : {
            convertedCurrencyTotals: {
              ...(portfolio.convertedCurrencyTotals.USD === undefined
                ? {}
                : { USD: portfolio.convertedCurrencyTotals.USD }),
              ...(portfolio.convertedCurrencyTotals.CNY === undefined
                ? {}
                : { CNY: portfolio.convertedCurrencyTotals.CNY }),
            },
          }),
      ...(portfolio?.referenceUsd === undefined
        ? !portfolio && referenceValue !== undefined
          ? {
              referenceAmount: {
                asset: { kind: ASSET_KINDS.Currency, code: currencyType },
                value: referenceValue,
              },
            }
          : {}
        : {
            referenceAmount: {
              asset: {
                kind: ASSET_KINDS.Currency,
                code:
                  getShareDisplayCurrency({ currencyType, currencyDisplay }) ??
                  CURRENCIES.USD,
              },
              value:
                portfolio.referenceUsd[
                  getShareDisplayCurrency({ currencyType, currencyDisplay }) ??
                    CURRENCIES.USD
                ],
            },
          }),
      coverage: portfolio?.coverage ?? FINANCIAL_COVERAGE.Unknown,
      ...(portfolio?.lastKnownCount
        ? { lastKnownCount: portfolio.lastKnownCount }
        : {}),
      includedCount: portfolio?.includedCount ?? 0,
      eligibleCount: portfolio?.eligibleCount ?? enabledAccountCount,
      duplicateCount: portfolio?.duplicateCount ?? 0,
      potentialDuplicateCount: portfolio?.potentialDuplicateCount ?? 0,
      manualCount: portfolio?.manualCount ?? 0,
      conflictCount: portfolio?.conflictCount ?? 0,
    },
    asOf: safeAsOf,
    backgroundSeed: seed,
  }

  if (!includeTodayCashflow) return payload
  if (!consumption && !income)
    return applyCashflow(payload, todayIncome, todayOutcome)
  const todayNetAmount = getShareNetAmount(
    payload.incomeSummary,
    payload.consumptionSummary,
    getShareDisplayCurrency(payload),
  )
  return todayNetAmount ? { ...payload, todayNetAmount } : payload
}

/**
 * Builds the allowlisted payload for an account snapshot.
 * Callers MUST pass only safe, non-secret fields (e.g., site name, origin-only URL).
 */
export const buildAccountShareSnapshotPayload = ({
  siteDayUsage,
  currencyType,
  currencyDisplay,
  exchangeRate,
  siteName,
  originUrl,
  balance,
  balanceSnapshot,
  allowances,
  consumption,
  income,
  includeTodayCashflow,
  todayIncome,
  todayOutcome,
  asOf,
  backgroundSeed,
}: {
  currencyType: CurrencyType
  currencyDisplay?: CurrencyDisplay
  siteName: string
  exchangeRate?: number
  originUrl?: string
  balance?: number
  siteDayUsage?: (AccountUsageSummary | SiteDayReading)[]
  balanceSnapshot?: BalanceSnapshot
  allowances?: AccountAllowanceSnapshot
  income?: Pick<
    ConsumptionProjection,
    "groups" | "nativeCoverage" | "references"
  >
  consumption?: Pick<
    ConsumptionProjection,
    "groups" | "nativeCoverage" | "references"
  >
  includeTodayCashflow: boolean
  todayIncome?: number
  todayOutcome?: number
  asOf?: number
  backgroundSeed?: number
}): AccountShareSnapshotPayload => {
  const exportTime = Date.now()
  const safeAsOf = resolveSafeAsOf(asOf, exportTime)
  const seed = resolveSeed(backgroundSeed, createShareSnapshotSeed)

  const balanceSummary = accountShareBalanceSummary(
    balanceSnapshot,
    allowances,
    exportTime,
  )
  const referenceValue = parseDecimal(balance)
  if (!balanceSnapshot && referenceValue !== undefined)
    balanceSummary.referenceAmount = {
      asset: { kind: ASSET_KINDS.Currency, code: currencyType },
      value: referenceValue,
    }
  const payload: AccountShareSnapshotPayload = {
    ...(includeTodayCashflow && siteDayUsage?.length
      ? {
          siteDayUsage: publicSiteDayUsage(
            siteDayUsage,
            getShareDisplayCurrency({ currencyType, currencyDisplay }),
            exchangeRate,
          ),
        }
      : {}),
    ...(includeTodayCashflow && income
      ? { incomeSummary: publicConsumptionSummary(income) }
      : {}),
    ...(includeTodayCashflow && consumption
      ? { consumptionSummary: publicConsumptionSummary(consumption) }
      : {}),
    kind: SHARE_SNAPSHOT_KINDS.Account,
    currencyType,
    ...(currencyDisplay === undefined ? {} : { currencyDisplay }),
    ...(exchangeRate !== undefined ? { exchangeRate } : {}),
    siteName: siteName.trim(),
    originUrl: originUrl ? sanitizeOriginUrl(originUrl) : undefined,
    balanceSummary,
    asOf: safeAsOf,
    backgroundSeed: seed,
  }

  if (!includeTodayCashflow) return payload
  if (!consumption && !income)
    return applyCashflow(payload, todayIncome, todayOutcome)
  const todayNetAmount = getShareNetAmount(
    payload.incomeSummary,
    payload.consumptionSummary,
    getShareDisplayCurrency(payload),
  )
  return todayNetAmount ? { ...payload, todayNetAmount } : payload
}

/**
 * Generates a localized multi-line caption for the given snapshot payload.
 * The caption is intended for social posts and is derived only from allowlisted data.
 */
export const generateShareSnapshotCaption = (
  payload: ShareSnapshotPayload,
): string => {
  const appName = getWatermarkText()
  const locale = getLocale()
  const labels = resolveOverlayLabels()

  const asOfText = formatAsOfTimestamp(payload.asOf, locale)
  const displayCurrency = getShareDisplayCurrency(payload)

  if (payload.kind === SHARE_SNAPSHOT_KINDS.Overview) {
    const header = `${appName} — ${labels.overview}`
    const summary = `${shareBalanceTitle(payload.balanceSummary)}: ${shareBalanceLines(payload.balanceSummary, locale, displayCurrency, payload.exchangeRate).join("\n")} · ${labels.accounts}: ${payload.enabledAccountCount}`
    const lines = [header, summary]

    appendCashflowAndAsOf(lines, payload, labels, asOfText, displayCurrency)
    return lines.join("\n")
  }

  const header = `${appName} — ${payload.siteName}`
  const originLine = payload.originUrl
  const summary = `${shareBalanceTitle(payload.balanceSummary)}: ${shareBalanceLines(payload.balanceSummary, locale, displayCurrency, payload.exchangeRate).join("\n")}`
  const lines = originLine ? [header, originLine, summary] : [header, summary]

  appendCashflowAndAsOf(lines, payload, labels, asOfText, displayCurrency)
  return lines.join("\n")
}

/**
 * Renders the snapshot payload to a `1200x1200` PNG blob using a mesh gradient background.
 */
const renderShareSnapshotToPng = async (
  payload: ShareSnapshotPayload,
): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = SHARE_SNAPSHOT_IMAGE.width
  canvas.height = SHARE_SNAPSHOT_IMAGE.height

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas not supported")
  }

  drawMeshGradientBackground(ctx, {
    seed: payload.backgroundSeed,
    width: canvas.width,
    height: canvas.height,
  })

  const locale = getLocale()
  const watermark = getWatermarkText()
  const labels = resolveOverlayLabels()

  drawShareSnapshotOverlay(ctx, {
    payload,
    width: canvas.width,
    height: canvas.height,
    locale,
    watermarkText: watermark,
    labels,
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Failed to encode PNG"))
        return
      }
      resolve(result)
    }, "image/png")
  })

  return blob
}

const tryCopyImageToClipboard = async (
  blob: Blob,
  caption: string,
): Promise<{ didCopyImage: boolean; didCopyCaption: boolean }> => {
  const clipboard =
    typeof navigator !== "undefined" ? navigator.clipboard : undefined

  type ClipboardItemConstructor = new (
    items: Record<string, Blob>,
  ) => ClipboardItem

  const ClipboardItemCtor = (
    globalThis as unknown as { ClipboardItem?: ClipboardItemConstructor }
  ).ClipboardItem

  if (!clipboard?.write || !ClipboardItemCtor) {
    return { didCopyImage: false, didCopyCaption: false }
  }

  try {
    const item = new ClipboardItemCtor({
      "image/png": blob,
      "text/plain": new Blob([caption], { type: "text/plain" }),
    })
    await clipboard.write([item])
    return { didCopyImage: true, didCopyCaption: true }
  } catch (error) {
    logger.debug(
      "Failed to write share snapshot image + caption to clipboard; falling back to image-only.",
      error,
    )
    // Fallback: image only (caption can be provided via UI)
  }

  try {
    const item = new ClipboardItemCtor({ "image/png": blob })
    await clipboard.write([item])
    return { didCopyImage: true, didCopyCaption: false }
  } catch (error) {
    logger.debug("Failed to write share snapshot image to clipboard.", error)
    return { didCopyImage: false, didCopyCaption: false }
  }
}

/**
 * Generates the snapshot image + caption and exports it using clipboard-first behavior.
 * Falls back to downloading the PNG when clipboard image copy is unsupported or fails.
 */
export const exportShareSnapshot = async (
  payload: ShareSnapshotPayload,
): Promise<ShareSnapshotExportResult> => {
  const caption = generateShareSnapshotCaption(payload)
  const imageBlob = await renderShareSnapshotToPng(payload)

  const stamp = formatLocalDateStamp(Date.now())
  const filename =
    payload.kind === SHARE_SNAPSHOT_KINDS.Overview
      ? `all-api-hub-snapshot-overview-${stamp}.png`
      : `all-api-hub-snapshot-${stamp}.png`

  const clipboardAttempt = await tryCopyImageToClipboard(imageBlob, caption)
  if (clipboardAttempt.didCopyImage) {
    return {
      method: "clipboard",
      caption,
      didCopyImage: true,
      didCopyCaption: clipboardAttempt.didCopyCaption,
      filename,
    }
  }

  downloadBlob(imageBlob, filename)

  const clipboard =
    typeof navigator !== "undefined" ? navigator.clipboard : undefined

  let didCopyCaption = false
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(caption)
      didCopyCaption = true
    }
  } catch {
    didCopyCaption = false
  }

  return {
    method: "download",
    caption,
    didCopyImage: false,
    didCopyCaption,
    filename,
  }
}
