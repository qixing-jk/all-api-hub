import * as chrono from "chrono-node"
import dayjs from "dayjs"

import { formatDatePickerValue, parseDatePickerValue } from "./datePickerValue"

const COMPACT_DATE_PATTERN = /^\d{5,8}$/
const SHORT_MONTH_DAY_PATTERN = /^\d{2,4}$/

/**
 * Returns true when natural input explicitly requests an empty expiration date.
 */
export function isNoExpirationNaturalInput(input: string): boolean {
  return /^(不过期|不设置|不设|无到期|没有到期|kein Ablauf|ohne Ablauf|unbegrenzt|no expiration)$/iu.test(
    input.trim(),
  )
}

/**
 * Parses Chinese phrases that Chrono does not currently cover.
 */
function parseChineseFallbackDate(
  input: string,
  referenceDate: Date,
): string | null {
  const normalizedInput = input.trim()

  if (normalizedInput === "下周") {
    return formatDatePickerValue(dayjs(referenceDate).add(1, "week").toDate())
  }

  if (normalizedInput === "下个月" || normalizedInput === "下月") {
    return formatDatePickerValue(dayjs(referenceDate).add(1, "month").toDate())
  }

  if (normalizedInput === "明年") {
    return formatDatePickerValue(dayjs(referenceDate).add(1, "year").toDate())
  }

  return null
}

/**
 * Parses Portuguese relative-day phrases that Chrono currently misreads.
 */
function parsePortugueseFallbackDate(
  input: string,
  referenceDate: Date,
): string | null | undefined {
  const normalizedInput = input.trim()
  if (!/^daqui a \d+/iu.test(normalizedInput)) return undefined

  const match = /^daqui a (\d+) (dia|dias)$/iu.exec(normalizedInput)
  if (!match) return null

  const days = Number(match[1])
  if (!Number.isSafeInteger(days) || days <= 0) return null

  const unit = match[2].toLocaleLowerCase("pt-BR")
  if (unit !== (days === 1 ? "dia" : "dias")) return null

  const parsedDate = dayjs(referenceDate).add(days, "day")
  return parsedDate.isValid()
    ? formatDatePickerValue(parsedDate.toDate())
    : null
}

/**
 * Parses German relative-day phrases while rejecting mismatched singular/plural units.
 */
function parseGermanFallbackDate(
  input: string,
  referenceDate: Date,
): string | null | undefined {
  const normalizedInput = input.trim()
  if (!/^in \d+ (tag|tagen)$/iu.test(normalizedInput)) return undefined

  const match = /^in (\d+) (tag|tagen)$/iu.exec(normalizedInput)
  if (!match) return null

  const days = Number(match[1])
  if (!Number.isSafeInteger(days) || days <= 0) return null

  const unit = match[2].toLocaleLowerCase("de-DE")
  if (unit !== (days === 1 ? "tag" : "tagen")) return null

  const parsedDate = dayjs(referenceDate).add(days, "day")
  return parsedDate.isValid()
    ? formatDatePickerValue(parsedDate.toDate())
    : null
}

/**
 * Parses natural-language dates with a Chrono parser and normalizes the result.
 */
function parseChronoDate(
  input: string,
  referenceDate: Date,
  parser: Pick<typeof chrono, "parseDate">,
): string | null {
  // Keep malformed ISO-like input from being reinterpreted as a natural date.
  if (/^\d{5,}[-/]/u.test(input.trim())) return null

  const parsedDate = parser.parseDate(input, referenceDate, {
    forwardDate: true,
  })
  if (!parsedDate) return null

  return formatDatePickerValue(parsedDate)
}

/**
 * Formats a compact numeric date candidate after verifying it is a real date.
 */
function formatCompactDateCandidate(
  year: number,
  month: number,
  day: number,
): string | null {
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return formatDatePickerValue(date)
}

/**
 * Parses compact numeric dates with a fixed 4-digit year prefix.
 */
function parseCompactDate(input: string): string | null {
  if (!COMPACT_DATE_PATTERN.test(input)) return null

  const year = Number(input.slice(0, 4))
  const tail = input.slice(4)

  const candidates: Array<{ month: number; day?: number }> = []
  if (tail.length === 1 || tail.length === 2) {
    candidates.push({ month: Number(tail) })
  } else if (tail.length === 3) {
    candidates.push({
      month: Number(tail.slice(0, 1)),
      day: Number(tail.slice(1)),
    })
  } else if (tail.length === 4) {
    candidates.push({
      month: Number(tail.slice(0, 2)),
      day: Number(tail.slice(2)),
    })
  }

  for (const candidate of candidates) {
    const month = candidate.month
    if (!Number.isSafeInteger(month) || month < 1 || month > 12) continue

    const day =
      candidate.day ??
      dayjs(new Date(year, month - 1, 1))
        .endOf("month")
        .date()
    if (!Number.isSafeInteger(day)) continue

    const parsed = formatCompactDateCandidate(year, month, day)
    if (parsed) return parsed
  }

  return null
}

/**
 * Parses short month-day input using the nearest future occurrence.
 */
function parseShortMonthDay(input: string, referenceDate: Date): string | null {
  if (!SHORT_MONTH_DAY_PATTERN.test(input)) return null

  const candidates: Array<{ month: number; day: number }> = []
  if (input.length === 2) {
    candidates.push({
      month: Number(input.slice(0, 1)),
      day: Number(input.slice(1)),
    })
  } else if (input.length === 3) {
    candidates.push({
      month: Number(input.slice(0, 1)),
      day: Number(input.slice(1)),
    })
  } else if (input.length === 4) {
    candidates.push({
      month: Number(input.slice(0, 2)),
      day: Number(input.slice(2)),
    })
  }

  for (const candidate of candidates) {
    const referenceYear = referenceDate.getFullYear()
    const currentYearDate = formatCompactDateCandidate(
      referenceYear,
      candidate.month,
      candidate.day,
    )
    if (!currentYearDate) continue

    const parsedDate = parseDatePickerValue(currentYearDate)
    if (!parsedDate) continue

    if (parsedDate >= dayjs(referenceDate).startOf("day").toDate()) {
      return currentYearDate
    }

    return formatCompactDateCandidate(
      referenceYear + 1,
      candidate.month,
      candidate.day,
    )
  }

  return null
}

/**
 * Parses expiry-date input into the DatePicker's canonical local YYYY-MM-DD value.
 */
export function parseNaturalDatePickerValue(
  input: string,
  referenceDate = new Date(),
): string | null {
  const normalizedInput = input.trim()
  if (!normalizedInput || isNoExpirationNaturalInput(normalizedInput)) {
    return null
  }

  const strictDate = parseDatePickerValue(normalizedInput)
  if (strictDate) return formatDatePickerValue(strictDate)

  const compactDate = parseCompactDate(normalizedInput)
  if (compactDate) return compactDate

  const shortMonthDay = parseShortMonthDay(normalizedInput, referenceDate)
  if (shortMonthDay) return shortMonthDay

  const simplifiedChineseDate = parseChronoDate(
    normalizedInput,
    referenceDate,
    chrono.zh.hans,
  )
  if (simplifiedChineseDate) return simplifiedChineseDate

  const traditionalChineseDate = parseChronoDate(
    normalizedInput,
    referenceDate,
    chrono.zh.hant,
  )
  if (traditionalChineseDate) return traditionalChineseDate

  const chineseFallbackDate = parseChineseFallbackDate(
    normalizedInput,
    referenceDate,
  )
  if (chineseFallbackDate) return chineseFallbackDate

  const portugueseFallbackDate = parsePortugueseFallbackDate(
    normalizedInput,
    referenceDate,
  )
  if (portugueseFallbackDate !== undefined) return portugueseFallbackDate

  const portugueseDate = parseChronoDate(
    normalizedInput,
    referenceDate,
    chrono.pt,
  )
  if (portugueseDate) return portugueseDate

  const germanFallbackDate = parseGermanFallbackDate(
    normalizedInput,
    referenceDate,
  )
  if (germanFallbackDate !== undefined) return germanFallbackDate

  const germanDate = parseChronoDate(normalizedInput, referenceDate, chrono.de)
  if (germanDate) return germanDate

  return parseChronoDate(normalizedInput, referenceDate, chrono)
}
