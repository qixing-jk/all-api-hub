import type { Locale } from "date-fns"
import { enUS, es, ja, vi, zhCN, zhTW } from "date-fns/locale"

const DATE_PICKER_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MIN_SUPPORTED_YEAR = 1000
const MAX_SUPPORTED_YEAR = 9999

/**
 * Formats a local calendar date as the canonical date-picker value.
 */
export function formatDatePickerValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Parses the canonical date-picker value into a local calendar date.
 */
export function parseDatePickerValue(value: string): Date | null {
  const match = DATE_PICKER_VALUE_PATTERN.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (
    year < MIN_SUPPORTED_YEAR ||
    year > MAX_SUPPORTED_YEAR ||
    !month ||
    !day
  ) {
    return null
  }

  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

/**
 * Converts a timestamp into the canonical date-picker value.
 */
export function formatDatePickerTimestamp(
  timestamp: number | undefined,
): string {
  if (!timestamp || timestamp <= 0) return ""
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  return formatDatePickerValue(date)
}

/**
 * Converts the canonical date-picker value into a local day-level timestamp.
 */
export function parseDatePickerTimestamp(value: string): number | null {
  return parseDatePickerValue(value)?.getTime() ?? null
}

/**
 * Maps the app language to the closest date-fns locale supported by the picker.
 */
export function getDatePickerLocale(language?: string): Locale {
  const normalizedLanguage = (language ?? "").toLowerCase()
  if (normalizedLanguage.startsWith("zh-tw")) return zhTW
  if (normalizedLanguage.startsWith("zh")) return zhCN
  if (normalizedLanguage.startsWith("ja")) return ja
  if (normalizedLanguage.startsWith("vi")) return vi
  if (normalizedLanguage.startsWith("es")) return es
  return enUS
}
