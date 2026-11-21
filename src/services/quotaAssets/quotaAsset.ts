import type { QuotaAsset } from "~/services/amounts/assets"
import {
  compareDecimal,
  divideDecimalByInteger,
  parseDecimal,
} from "~/services/amounts/decimal"
import {
  formatCompactDecimal,
  formatExactDecimal,
  type CompactDecimalOptions,
} from "~/utils/core/decimalFormatting"

export type { QuotaAsset } from "~/services/amounts/assets"

/** Stored amounts are atomic; scaling belongs only at the display boundary. */
export function formatQuotaAmount(
  amount: number | string,
  asset: QuotaAsset,
  locale?: string,
  compact = false,
  options: CompactDecimalOptions = {},
) {
  const value = parseDecimal(amount)
  if (value === undefined) return `- ${asset.label}`
  try {
    const scaled = divideDecimalByInteger(value, asset.displayScale)
    // Atomic units avoid tiny rounded millions and repeated compact scales such as "10K M Token".
    const atomic =
      compact &&
      ((compareDecimal(scaled.replace(/^-/, ""), "0.01") < 0 &&
        scaled !== "0") ||
        (options.maximumIntegerDigits !== undefined &&
          scaled.replace(/^-/, "").split(".")[0]!.length >=
            options.maximumIntegerDigits))
    return `${(compact ? formatCompactDecimal : formatExactDecimal)(atomic ? value : scaled, locale, options)} ${atomic ? asset.label : asset.displayLabel}`
  } catch {
    // An unsupported display scale cannot change the underlying atomic value.
    return `${(compact ? formatCompactDecimal : formatExactDecimal)(value, locale, options)} ${asset.label}`
  }
}

export { quotaAssetSchema } from "~/services/amounts/assets"
