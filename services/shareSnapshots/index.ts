import i18next from "i18next"

import { drawMeshGradientBackground } from "~/services/shareSnapshots/meshGradientBackground"
import {
  drawShareSnapshotOverlay,
  type ShareSnapshotOverlayLabels,
} from "~/services/shareSnapshots/shareSnapshotOverlay"
import type {
  AccountShareSnapshotPayload,
  OverviewShareSnapshotPayload,
  ShareSnapshotExportResult,
  ShareSnapshotPayload,
} from "~/services/shareSnapshots/types"
import {
  createShareSnapshotSeed,
  formatAsOfTimestamp,
  formatCurrencyAmount,
  formatLocalDateStamp,
  formatSignedCurrencyAmount,
} from "~/services/shareSnapshots/utils"
import type { CurrencyType } from "~/types"
import { createLogger } from "~/utils/logger"

export const SHARE_SNAPSHOT_IMAGE = {
  width: 1200,
  height: 1200,
} as const

const APP_WATERMARK_FALLBACK = "All API Hub"

const logger = createLogger("ShareSnapshots")

const getWatermarkText = (): string => {
  const translated = i18next.t("ui:app.name")
  return translated && translated !== "ui:app.name"
    ? translated
    : APP_WATERMARK_FALLBACK
}

const getLocale = (): string | undefined => {
  const lng = i18next.language
  return lng && lng !== "cimode"
    ? lng.toLowerCase().replace(/_/g, "-")
    : undefined
}

const resolveOverlayLabels = (): ShareSnapshotOverlayLabels => ({
  overview: i18next.t("shareSnapshots:labels.overview"),
  totalBalance: i18next.t("shareSnapshots:labels.totalBalance"),
  balance: i18next.t("shareSnapshots:labels.balance"),
  accounts: i18next.t("shareSnapshots:labels.accounts"),
  site: i18next.t("shareSnapshots:labels.site"),
  asOf: i18next.t("shareSnapshots:labels.asOf"),
  today: i18next.t("shareSnapshots:labels.today"),
  income: i18next.t("shareSnapshots:labels.income"),
  outcome: i18next.t("shareSnapshots:labels.outcome"),
  net: i18next.t("shareSnapshots:labels.net"),
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
  todayIncome?: number
  todayOutcome?: number
  todayNet?: number
}

const applyCashflow = <TPayload extends ShareSnapshotCashflowPayload>(
  payload: TPayload,
  todayIncome: number | undefined,
  todayOutcome: number | undefined,
): TPayload => {
  const income = Number.isFinite(todayIncome) ? (todayIncome as number) : 0
  const outcome = Number.isFinite(todayOutcome) ? (todayOutcome as number) : 0

  return {
    ...payload,
    todayIncome: income,
    todayOutcome: outcome,
    todayNet: income - outcome,
  }
}

const appendCashflowAndAsOf = (
  lines: string[],
  payload: ShareSnapshotCashflowPayload,
  labels: ShareSnapshotOverlayLabels,
  asOfText: string,
  currencyType: CurrencyType,
) => {
  if (
    typeof payload.todayIncome === "number" &&
    typeof payload.todayOutcome === "number" &&
    typeof payload.todayNet === "number"
  ) {
    lines.push(
      `${labels.today}: ${labels.income} ${formatSignedCurrencyAmount(
        payload.todayIncome,
        currencyType,
      )} / ${labels.outcome} ${formatSignedCurrencyAmount(
        -payload.todayOutcome,
        currencyType,
      )} · ${labels.net} ${formatSignedCurrencyAmount(
        payload.todayNet,
        currencyType,
      )}`,
    )
  }

  lines.push(`${labels.asOf}: ${asOfText}`)
}

/**
 * Builds the allowlisted payload for an overview snapshot (aggregated across enabled accounts only).
 */
export const buildOverviewShareSnapshotPayload = ({
  currencyType,
  enabledAccountCount,
  totalBalance,
  includeTodayCashflow,
  todayIncome,
  todayOutcome,
  asOf,
  backgroundSeed,
}: {
  currencyType: CurrencyType
  enabledAccountCount: number
  totalBalance: number
  includeTodayCashflow: boolean
  todayIncome?: number
  todayOutcome?: number
  asOf?: number
  backgroundSeed?: number
}): OverviewShareSnapshotPayload => {
  const exportTime = Date.now()
  const safeAsOf = resolveSafeAsOf(asOf, exportTime)
  const seed = resolveSeed(backgroundSeed, createShareSnapshotSeed)

  const payload: OverviewShareSnapshotPayload = {
    kind: "overview",
    currencyType,
    enabledAccountCount: Math.max(0, Math.floor(enabledAccountCount)),
    totalBalance: Number.isFinite(totalBalance) ? totalBalance : 0,
    asOf: safeAsOf,
    backgroundSeed: seed,
  }

  return includeTodayCashflow
    ? applyCashflow(payload, todayIncome, todayOutcome)
    : payload
}

/**
 * Builds the allowlisted payload for an account snapshot.
 * Callers MUST pass only safe, non-secret fields (e.g., site name, origin-only URL).
 */
export const buildAccountShareSnapshotPayload = ({
  currencyType,
  siteName,
  originUrl,
  balance,
  includeTodayCashflow,
  todayIncome,
  todayOutcome,
  asOf,
  backgroundSeed,
}: {
  currencyType: CurrencyType
  siteName: string
  originUrl?: string
  balance: number
  includeTodayCashflow: boolean
  todayIncome?: number
  todayOutcome?: number
  asOf?: number
  backgroundSeed?: number
}): AccountShareSnapshotPayload => {
  const exportTime = Date.now()
  const safeAsOf = resolveSafeAsOf(asOf, exportTime)
  const seed = resolveSeed(backgroundSeed, createShareSnapshotSeed)

  const payload: AccountShareSnapshotPayload = {
    kind: "account",
    currencyType,
    siteName: siteName.trim(),
    originUrl: originUrl?.trim() || undefined,
    balance: Number.isFinite(balance) ? balance : 0,
    asOf: safeAsOf,
    backgroundSeed: seed,
  }

  return includeTodayCashflow
    ? applyCashflow(payload, todayIncome, todayOutcome)
    : payload
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

  if (payload.kind === "overview") {
    const header = `${appName} — ${labels.overview}`
    const summary = `${labels.totalBalance}: ${formatCurrencyAmount(
      payload.totalBalance,
      payload.currencyType,
    )} · ${labels.accounts}: ${payload.enabledAccountCount}`

    const lines = [header, summary]

    appendCashflowAndAsOf(
      lines,
      payload,
      labels,
      asOfText,
      payload.currencyType,
    )
    return lines.join("\n")
  }

  const header = `${appName} — ${payload.siteName}`
  const originLine = payload.originUrl
  const summary = `${labels.balance}: ${formatCurrencyAmount(
    payload.balance,
    payload.currencyType,
  )}`

  const lines = originLine ? [header, originLine, summary] : [header, summary]

  appendCashflowAndAsOf(lines, payload, labels, asOfText, payload.currencyType)
  return lines.join("\n")
}

/**
 * Renders the snapshot payload to a `1200x1200` PNG blob using a mesh gradient background.
 */
export const renderShareSnapshotToPng = async (
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

/**
 * Triggers a file download and defers Blob URL cleanup so the browser has time
 * to start the download before the URL is revoked.
 */
const downloadBlob = (blob: Blob, filename: string) => {
  const REVOKE_DELAY_MS = 1000
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, REVOKE_DELAY_MS)
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
    payload.kind === "overview"
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
