/** Product quota units per USD; adapters normalize upstream amounts to this scale. */
export const QUOTA_PER_USD = 500_000

/** Historical fallback used when an account has no configured USD-to-CNY rate. */
export const DEFAULT_USD_TO_CNY_RATE = 7.2

export const CURRENCY_SYMBOLS = {
  USD: "$",
  CNY: "¥",
} as const
