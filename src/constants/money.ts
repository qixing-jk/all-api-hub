/** Product quota units per USD; adapters normalize upstream amounts to this scale. */
export const QUOTA_PER_USD = 500_000

/** Historical fallback used when an account has no configured USD-to-CNY rate. */
export const DEFAULT_USD_TO_CNY_RATE = 7.2

/** Supported display currencies; upstream currency codes keep their native values. */
export const CURRENCIES = {
  USD: "USD",
  CNY: "CNY",
} as const

export const CURRENCY_SYMBOLS = {
  USD: "$",
  CNY: "¥",
} as const

/** Recognize the exact supported pair without widening arbitrary upstream codes. */
export function isSupportedCurrency(
  value: unknown,
): value is (typeof CURRENCIES)[keyof typeof CURRENCIES] {
  return Object.values(CURRENCIES).some((currency) => currency === value)
}
