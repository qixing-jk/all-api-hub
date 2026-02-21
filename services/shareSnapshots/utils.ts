import type { CurrencyType } from "~/types"
import { getCurrencySymbol } from "~/utils/formatters"
import { formatMoneyFixed } from "~/utils/money"

const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g
const BEARER_PATTERN = /\bBearer\s+([a-zA-Z0-9._-]+)\b/gi

/**
 * Best-effort redaction for secret-like substrings that may appear in optional
 * user-controlled text (e.g., notes). This does not replace the allowlist-based
 * export pipeline; it is a defense-in-depth helper.
 */
export const redactShareSecrets = (value: string): string =>
  value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")

/**
 * Normalizes a URL string to origin-only (scheme + host + optional port).
 * Returns undefined when the input is missing, invalid, or has an opaque origin
 * (e.g. `"null"`).
 */
export const sanitizeOriginUrl = (
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  try {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const origin = new URL(trimmed).origin
    if (!origin || origin === "null") return undefined
    return origin
  } catch {
    return undefined
  }
}

/**
 * Formats a numeric amount into a currency string (e.g. `$12.34`), always using
 * fixed decimals and keeping the sign.
 */
export const formatCurrencyAmount = (
  value: number,
  currencyType: CurrencyType,
): string => {
  const symbol = getCurrencySymbol(currencyType)
  const amount = formatMoneyFixed(Math.abs(value))
  return value < 0 ? `-${symbol}${amount}` : `${symbol}${amount}`
}

/**
 * Formats a numeric amount into a signed currency string (e.g. `+$12.34`).
 */
export const formatSignedCurrencyAmount = (
  value: number,
  currencyType: CurrencyType,
): string => {
  const symbol = getCurrencySymbol(currencyType)
  const amount = formatMoneyFixed(Math.abs(value))
  const sign = value < 0 ? "-" : "+"
  return `${sign}${symbol}${amount}`
}

/**
 * Formats an "as of" timestamp using the provided locale (defaults to the
 * current runtime locale when omitted). Falls back to now when timestamp is
 * missing/invalid.
 */
export const formatAsOfTimestamp = (
  timestamp: number,
  locale?: string,
): string => {
  const safeTimestamp =
    Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
  const date = new Date(safeTimestamp)
  try {
    return locale ? date.toLocaleString(locale) : date.toLocaleString()
  } catch {
    return date.toLocaleString()
  }
}

/**
 * Creates a random uint32 seed for generating mesh gradient backgrounds.
 */
export const createShareSnapshotSeed = (): number => {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0
  }

  const UINT32_RANGE = 2 ** 32
  return Math.floor(Math.random() * UINT32_RANGE) >>> 0
}

/**
 * Deterministic PRNG for seeded visuals.
 */
export const mulberry32 = (seed: number) => {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Clamps a value to the inclusive range [min, max].
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export type Rgb = {
  r: number
  g: number
  b: number
}

export const clampByte = (value: number): number =>
  clamp(Math.round(value), 0, 255)

// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
export const relativeLuminanceFromRgb = ({ r, g, b }: Rgb): number => {
  const toLinear = (n: number) => {
    const c = clamp(n / 255, 0, 1)
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  const rr = toLinear(r)
  const gg = toLinear(g)
  const bb = toLinear(b)
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
}

/**
 * Formats a local YYYY-MM-DD stamp for filenames.
 */
export const formatLocalDateStamp = (timestamp: number): string => {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
