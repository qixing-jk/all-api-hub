import { UI_CONSTANTS } from "~/constants/ui"

/**
 * Formatting options for money-like numeric values used across the UI.
 */
export type MoneyFormatOptions = {
  decimals: number
  minNonZero: number
}

/**
 * Default money formatting options for the application UI.
 */
export const DEFAULT_MONEY_FORMAT_OPTIONS: MoneyFormatOptions = {
  decimals: UI_CONSTANTS.MONEY.DECIMALS,
  minNonZero: UI_CONSTANTS.MONEY.MIN_NON_ZERO,
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
export const roundToDecimals = (value: number, decimals: number): number => {
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
