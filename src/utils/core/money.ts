import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  DEFAULT_USD_TO_CNY_RATE,
  isSupportedCurrency,
} from "~/constants/money"
import type { Asset } from "~/services/amounts/assets"
import type { Amount } from "~/services/amounts/balance"
import {
  DECIMAL_BOUNDS,
  DECIMAL_ERRORS,
  divideDecimal,
  multiplyDecimal,
  normalizeDecimalUnits,
  parseDecimal,
} from "~/services/amounts/decimal"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { formatQuotaAmount } from "~/services/quotaAssets/quotaAsset"
import type { CurrencyType } from "~/types"
import {
  formatCompactDecimal,
  formatExactDecimal,
  type CompactDecimalOptions,
} from "~/utils/core/decimalFormatting"

/** Unscaled labels describe missing amounts; display scales belong to amount formatting. */
export function getAssetLabel(asset: Asset, unknownLabel = ""): string {
  switch (asset.kind) {
    case ASSET_KINDS.Currency:
      return asset.code
    case ASSET_KINDS.Quota:
      return asset.label
    case ASSET_KINDS.Crypto:
      return asset.id
    case ASSET_KINDS.Unknown:
      return unknownLabel
  }
}

/** Charts use the same native scale as account amounts, while storage remains atomic. */
export function getAssetDisplayValue(amount: Amount): string {
  return amount.asset.kind === ASSET_KINDS.Quota
    ? (normalizeDecimalUnits(amount.value, amount.asset.displayScale) ??
        amount.value)
    : amount.value
}

/** Formats the native asset at the display boundary without changing its value. */
export function formatAssetAmount(amount: Amount, locale?: string): string {
  if (amount.asset.kind === ASSET_KINDS.Quota)
    return formatQuotaAmount(amount.value, amount.asset, locale)
  if (amount.asset.kind === ASSET_KINDS.Crypto)
    return `${formatExactDecimal(amount.value, locale)} ${amount.asset.id}`
  return formatExactDecimal(amount.value, locale, {
    style: "currency",
    currency: amount.asset.code,
    currencyDisplay: "code",
  })
}

/** Bounded native summaries; details and pricing keep the exact formatter. */
export function formatCompactAssetAmount(
  amount: Amount,
  locale?: string,
  options: CompactDecimalOptions = {},
): string {
  if (amount.asset.kind === ASSET_KINDS.Quota)
    return formatQuotaAmount(amount.value, amount.asset, locale, true, options)
  if (amount.asset.kind === ASSET_KINDS.Crypto)
    return `${formatCompactDecimal(amount.value, locale, options)} ${amount.asset.id}`
  return formatCompactDecimal(amount.value, locale, {
    ...options,
    style: "currency",
    currency: amount.asset.code,
    currencyDisplay: "code",
  })
}

/** Convert using the configured approximate rate, without treating it as an upstream integer observation. */
export function convertUsdToCny(
  value: string,
  exchangeRate = DEFAULT_USD_TO_CNY_RATE,
) {
  const rate = parseDecimal(
    String(
      exchangeRate > 0 && Number.isFinite(exchangeRate)
        ? exchangeRate
        : DEFAULT_USD_TO_CNY_RATE,
    ),
  )!
  return multiplyDecimal(value, rate)
}

/** Display-only conversion keeps enough fractional places for small native amounts. */
export function convertCnyToUsd(
  value: string,
  exchangeRate = DEFAULT_USD_TO_CNY_RATE,
): string {
  const rate = convertUsdToCny("1", exchangeRate)
  const normalized = parseDecimal(value)
  if (normalized === undefined) throw new Error(DECIMAL_ERRORS.Invalid)
  const wholeLength = Math.max(
    divideDecimal(normalized, rate, 0).length,
    normalized.startsWith("-") ? 2 : 1,
  )
  // A large divisor shifts an already fractional amount further right; budget for both operands.
  const fractionalPlaces = Math.min(
    (normalized.split(".")[1] ?? "").length + rate.split(".")[0]!.length + 18,
    Math.max(0, DECIMAL_BOUNDS.MaxLength - wholeLength - 1),
  )
  const converted = divideDecimal(normalized, rate, fractionalPlaces)
  if (converted === "0" && normalized !== "0")
    throw new Error(DECIMAL_ERRORS.Underflow)
  return converted
}

/** Only the supported monetary pair is converted; original and noncurrency units stay intact. */
export function convertCurrencyAmount(
  amount: Amount,
  currencyType?: CurrencyType,
  exchangeRate = DEFAULT_USD_TO_CNY_RATE,
): Amount {
  if (
    !currencyType ||
    amount.asset.kind !== ASSET_KINDS.Currency ||
    amount.asset.code === currencyType ||
    !isSupportedCurrency(amount.asset.code)
  )
    return amount
  try {
    return {
      asset: { kind: ASSET_KINDS.Currency, code: currencyType },
      value:
        amount.asset.code === CURRENCIES.USD
          ? convertUsdToCny(amount.value, exchangeRate)
          : convertCnyToUsd(amount.value, exchangeRate),
    }
  } catch {
    return amount
  }
}

/** Preserve native display precision; round only new estimates from a monetary conversion. */
export function formatCurrencyDisplayAmount(
  amount: Amount,
  locale?: string,
  currencyType?: CurrencyType,
  exchangeRate?: number,
): string {
  const converted = convertCurrencyAmount(amount, currencyType, exchangeRate)
  const changedCurrency =
    amount.asset.kind === ASSET_KINDS.Currency &&
    converted.asset.kind === ASSET_KINDS.Currency &&
    amount.asset.code !== converted.asset.code
  return (changedCurrency ? formatCompactAssetAmount : formatAssetAmount)(
    converted,
    locale,
  )
}

/** A selected currency converts monetary amounts; omission preserves the original currency. */
export function formatBalanceAmount(
  amount: Amount,
  locale?: string,
  currencyType?: CurrencyType,
  exchangeRate = DEFAULT_USD_TO_CNY_RATE,
  options: CompactDecimalOptions = {},
): string {
  if (amount.asset.kind !== ASSET_KINDS.Currency)
    return formatCompactAssetAmount(amount, locale, options)
  const converted = convertCurrencyAmount(amount, currencyType, exchangeRate)
  const currency =
    converted.asset.kind === ASSET_KINDS.Currency
      ? converted.asset.code
      : amount.asset.code
  return formatCompactDecimal(converted.value, locale, {
    ...options,
    style: "currency",
    currency,
    currencyDisplay:
      currency === CURRENCIES.USD || currency === CURRENCIES.CNY
        ? "narrowSymbol"
        : "code",
  })
}

/** Decimal precision shared by static and animated money displays. */
export const MONEY_DECIMAL_PLACES = 2

/**
 * Formatting options for money-like numeric values used across the UI.
 */
type MoneyFormatOptions = {
  decimals: number
  minNonZero: number
}

/**
 * Default money formatting options for the application UI.
 */
const DEFAULT_MONEY_FORMAT_OPTIONS: MoneyFormatOptions = {
  decimals: MONEY_DECIMAL_PLACES,
  minNonZero: 0.01,
}

/**
 * Maps extremely small non-zero values to a minimum display value so that fixed-decimal
 * formatting does not render them as `0.00`.
 */
export const normalizeMoneyForDisplay = (
  value: number,
  { minNonZero }: Pick<MoneyFormatOptions, "minNonZero">,
): number => {
  if (!Number.isFinite(value) || value === 0) return 0

  const abs = Math.abs(value)
  if (abs < minNonZero) {
    return Math.sign(value) * minNonZero
  }

  return value
}

/**
 * Rounds a number to the specified decimal places as a numeric value.
 */
const roundToDecimals = (value: number, decimals: number): number => {
  if (!Number.isFinite(value)) return 0
  if (decimals <= 0) return Math.round(value)

  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * Normalizes then rounds for display in UI (e.g. CountUp end/start values).
 */
export const getDisplayMoneyValue = (
  value: number,
  { decimals, minNonZero }: MoneyFormatOptions = DEFAULT_MONEY_FORMAT_OPTIONS,
): number => {
  const normalized = normalizeMoneyForDisplay(value, { minNonZero })
  return roundToDecimals(normalized, decimals)
}

/**
 * Formats a value using fixed decimals after applying minimum non-zero mapping.
 */
export const formatMoneyFixed = (
  value: number,
  { decimals, minNonZero }: MoneyFormatOptions = DEFAULT_MONEY_FORMAT_OPTIONS,
): string => {
  return getDisplayMoneyValue(value, { decimals, minNonZero }).toFixed(decimals)
}

/**
 * Formats a USD telemetry amount in the selected display currency.
 */
export const formatTelemetryMoney = (
  valueUsd: number | undefined,
  currencyType: CurrencyType,
): string => {
  if (typeof valueUsd !== "number" || !Number.isFinite(valueUsd)) return "-"

  const value =
    currencyType === CURRENCIES.CNY
      ? valueUsd * DEFAULT_USD_TO_CNY_RATE
      : valueUsd

  return `${CURRENCY_SYMBOLS[currencyType]}${getDisplayMoneyValue(
    value,
  ).toFixed(MONEY_DECIMAL_PLACES)}`
}
