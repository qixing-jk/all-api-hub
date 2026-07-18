import type { TodayUsageData } from "~/services/accounts/accountDataModel"

export interface TodayTimestampRange {
  start: number
  end: number
}

export interface MetricAggregationCoverage {
  validCount: number
  invalidCount: number
}

export interface UsageAggregationCoverage {
  rows: MetricAggregationCoverage
  consumption: MetricAggregationCoverage
  promptTokens: MetricAggregationCoverage
  completionTokens: MetricAggregationCoverage
}

export interface AggregatedUsageData
  extends Omit<TodayUsageData, "today_requests_count"> {
  coverage: UsageAggregationCoverage
}

export interface AggregatedIncomeData {
  today_income: number
  coverage: MetricAggregationCoverage
}

const createMetricCoverage = (): MetricAggregationCoverage => ({
  validCount: 0,
  invalidCount: 0,
})

const createUsageCoverage = (): UsageAggregationCoverage => ({
  rows: createMetricCoverage(),
  consumption: createMetricCoverage(),
  promptTokens: createMetricCoverage(),
  completionTokens: createMetricCoverage(),
})

const cloneMetricCoverage = (
  coverage: MetricAggregationCoverage,
): MetricAggregationCoverage => ({ ...coverage })

const cloneUsageAggregation = (
  aggregation: AggregatedUsageData,
): AggregatedUsageData => ({
  today_quota_consumption: aggregation.today_quota_consumption,
  today_prompt_tokens: aggregation.today_prompt_tokens,
  today_completion_tokens: aggregation.today_completion_tokens,
  coverage: {
    rows: cloneMetricCoverage(aggregation.coverage.rows),
    consumption: cloneMetricCoverage(aggregation.coverage.consumption),
    promptTokens: cloneMetricCoverage(aggregation.coverage.promptTokens),
    completionTokens: cloneMetricCoverage(
      aggregation.coverage.completionTokens,
    ),
  },
})

const addFiniteValue = (current: number, value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null

  const next = current + value
  return Number.isFinite(next) ? next : null
}

const addMetricValue = (
  aggregation: { value: number; coverage: MetricAggregationCoverage },
  value: unknown,
) => {
  const next = addFiniteValue(aggregation.value, value)
  if (next === null) {
    aggregation.coverage.invalidCount += 1
    return
  }

  aggregation.value = next
  aggregation.coverage.validCount += 1
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * Compute today's start/end unix timestamps (seconds).
 * @returns Object with start and end seconds for the current day.
 */
export const getTodayTimestampRange = (): TodayTimestampRange => {
  const today = new Date()

  today.setHours(0, 0, 0, 0)
  const start = Math.floor(today.getTime() / 1000)

  today.setHours(23, 59, 59, 999)
  const end = Math.floor(today.getTime() / 1000)

  return { start, end }
}

/**
 * Aggregate validated usage metrics while retaining per-field coverage.
 * @param items Untrusted log rows to validate and sum.
 * @param initial Optional aggregation from earlier pages.
 * @returns Finite totals and validity counts for rows and metric fields.
 */
export const aggregateUsageData = (
  items: readonly unknown[],
  initial: AggregatedUsageData = {
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    coverage: createUsageCoverage(),
  },
): AggregatedUsageData => {
  const result = cloneUsageAggregation(initial)

  for (const item of items) {
    if (!isRecord(item)) {
      result.coverage.rows.invalidCount += 1
      result.coverage.consumption.invalidCount += 1
      result.coverage.promptTokens.invalidCount += 1
      result.coverage.completionTokens.invalidCount += 1
      continue
    }

    result.coverage.rows.validCount += 1
    const consumption = {
      value: result.today_quota_consumption,
      coverage: result.coverage.consumption,
    }
    addMetricValue(consumption, item.quota)
    result.today_quota_consumption = consumption.value

    const promptTokens = {
      value: result.today_prompt_tokens,
      coverage: result.coverage.promptTokens,
    }
    addMetricValue(promptTokens, item.prompt_tokens)
    result.today_prompt_tokens = promptTokens.value

    const completionTokens = {
      value: result.today_completion_tokens,
      coverage: result.coverage.completionTokens,
    }
    addMetricValue(completionTokens, item.completion_tokens)
    result.today_completion_tokens = completionTokens.value
  }

  return result
}

/**
 * Aggregate income logs using content only for the quota-absent dialect.
 * @param items Untrusted income log rows.
 * @param exchangeRate CNY per USD exchange rate used by content parsing.
 * @param conversionFactor Backend quota units per parsed currency unit.
 * @param initial Optional aggregation from earlier pages.
 * @returns Finite income total plus valid and invalid contribution counts.
 */
export const aggregateIncomeData = (
  items: readonly unknown[],
  exchangeRate: number,
  conversionFactor = 100,
  initial: AggregatedIncomeData = {
    today_income: 0,
    coverage: createMetricCoverage(),
  },
): AggregatedIncomeData => {
  const result: AggregatedIncomeData = {
    today_income: initial.today_income,
    coverage: cloneMetricCoverage(initial.coverage),
  }

  for (const item of items) {
    if (!isRecord(item)) {
      result.coverage.invalidCount += 1
      continue
    }

    let value: unknown
    if (Object.hasOwn(item, "quota")) {
      value = item.quota
    } else if (typeof item.content === "string") {
      const extracted = extractAmount(item.content, exchangeRate)
      value =
        extracted && Number.isFinite(extracted.amount)
          ? conversionFactor * extracted.amount
          : undefined
    }

    const next = addFiniteValue(result.today_income, value)
    if (next === null) {
      result.coverage.invalidCount += 1
      continue
    }

    result.today_income = next
    result.coverage.validCount += 1
  }

  return result
}

/**
 * Extract currency symbol and numeric amount from a free-form string.
 * @param text Input text containing currency and amount.
 * @param exchangeRate CNY per USD exchange rate for ¥ normalization.
 * @returns Symbol and USD amount when detected; otherwise null.
 */
export function extractAmount(
  text: string,
  exchangeRate: number,
): { currencySymbol: string; amount: number } | null {
  const regex = /([\p{Sc}])\s*([\d,]+(?:\.\d+)?)/u
  const match = text.match(regex)

  if (!match) return null

  const currencySymbol = match[1]
  let amount = parseFloat(match[2].replace(/,/g, ""))

  if (currencySymbol === "¥") {
    amount = amount / exchangeRate
  }

  return { currencySymbol, amount }
}
