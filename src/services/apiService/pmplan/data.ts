import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
} from "~/services/accounts/allowances"
import { accountReportingScope } from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { observeAmount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  compareDecimal,
  normalizeDecimalUnits,
} from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { AccountUsageRecord, AccountUsageSummary } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS as reasons,
  ACCOUNT_TODAY_METRIC_STATUSES as statuses,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS, PMPLAN_MICRO_USD_PER_USD } from "./constants"

const ALLOWANCE_COLLECTION_KEY = "rolling-allowances"

/** Native prices and consumed allowances use integer millionths of USD. */
const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
const micro = (value: unknown): number | undefined => {
  const amount = count(value)
  return amount === undefined ? undefined : amount / PMPLAN_MICRO_USD_PER_USD
}
const invalidData = (): never => {
  throw new ApiError(
    "Invalid PM-Plan allowance response",
    undefined,
    PMPLAN_ENDPOINTS.Identity,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}
const requiredCount = (value: unknown) => count(value) ?? invalidData()

/** The server's calendar day, rather than the device's timezone, selects the daily aggregate. */
function todayStats(body: Record<string, unknown>, collect: boolean) {
  const availability = createUnsupportedTodayStatsAvailability()
  let requests = 0,
    consumption = 0
  const absent = { usage: undefined, cost: undefined }
  const unavailable = {
    status: statuses.Unavailable,
    reason: collect ? reasons.InvalidPayload : reasons.NotCollected,
  }
  availability.requests = unavailable
  availability.consumption = unavailable
  if (!collect) return { availability, requests, consumption, ...absent }
  const today = isRecord(body.checkin) ? body.checkin.today : undefined
  if (
    typeof today !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    !Array.isArray(body.daily_usage)
  )
    return { availability, requests, consumption, ...absent }
  const instant = new Date(`${today}T00:00:00Z`)
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 10) !== today
  )
    return { availability, requests, consumption, ...absent }
  const matches = body.daily_usage.filter(
    (value) => isRecord(value) && value.day === today.slice(5),
  )
  if (matches.length !== 1 || !isRecord(matches[0]))
    return { availability, requests, consumption, ...absent }
  const daily = matches[0]
  const requestCount = count(daily.requests),
    cost = micro(daily.cost_micro)
  if (requestCount !== undefined) {
    requests = requestCount
    availability.requests = {
      status: statuses.Unavailable,
      reason: reasons.WrongPeriod,
    }
  }
  if (cost !== undefined) {
    consumption = cost * QUOTA_PER_USD
    availability.consumption = {
      status: statuses.Unavailable,
      reason: reasons.WrongPeriod,
    }
  }
  const reportedCost = normalizeDecimalUnits(
    count(daily.cost_micro),
    PMPLAN_MICRO_USD_PER_USD,
  )
  const usage: AccountUsageSummary = {
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    reportedDay: today,
    totalRequests: requestCount,
  }
  return { availability, requests, consumption, usage, cost: reportedCost }
}

/** The native audit exposes total tokens, USD cost and HTTP status, without an input/output split. */
function recentUsage(value: unknown): AccountUsageRecord[] | undefined {
  if (!Array.isArray(value)) return undefined
  const records: AccountUsageRecord[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.model !== "string" ||
      typeof item.created_at !== "string" ||
      !Number.isFinite(Date.parse(item.created_at))
    )
      return undefined
    const tokens = count(item.total_tokens),
      cost = micro(item.cost_micro),
      status = count(item.status)
    if (
      tokens === undefined ||
      cost === undefined ||
      status === undefined ||
      status > 599
    )
      return undefined
    records.push({
      requestTime: item.created_at,
      model: item.model,
      totalTokens: tokens,
      cost,
      status: String(status),
      ...(typeof item.error_code === "string" && item.error_code
        ? { errorMessage: item.error_code }
        : {}),
    })
  }
  return records
}

/** Rolling limits overlap; they are not purchased cash, and must never be added together. */
export function parsePmplanAccountData(
  body: Record<string, unknown>,
  request: ApiServiceAccountRequest,
): AccountData {
  if (
    !isRecord(body.plan) ||
    typeof body.plan.name !== "string" ||
    !body.plan.name.trim() ||
    !isRecord(body.usage)
  )
    return invalidData()
  const planName = body.plan.name,
    usage = body.usage
  const observedAt = Date.now()
  const scope = accountReportingScope(request)
  const source = {
    adapter: "pmplan",
    operation: "/api/me:usage",
    contractVersion: "micro-usd/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const windows = [
    ["h5", "5H", BUDGET_PERIODS.FiveHours],
    ["weekly", "7D", BUDGET_PERIODS.Week],
    ["monthly", "30D", BUDGET_PERIODS.Month],
  ] as const
  const entries = windows.map(([key, label, period]) => {
    const used = requiredCount(usage[`${key}_used`])
    const limit = usage[`${key}_limit`]
    const ceiling = limit === null ? undefined : requiredCount(limit)
    return {
      id: key,
      label: `${planName} · ${label}`,
      identityKind: ALLOWANCE_IDENTITY_KINDS.SourceSlot,
      collectionKey: ALLOWANCE_COLLECTION_KEY,
      validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
      constraint: budgetConstraint({
        scope,
        source,
        observedAt,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState:
          ceiling === undefined
            ? BUDGET_LIMIT_STATES.Unlimited
            : BUDGET_LIMIT_STATES.Finite,
        used: normalizeDecimalUnits(used, PMPLAN_MICRO_USD_PER_USD),
        limit: normalizeDecimalUnits(ceiling, PMPLAN_MICRO_USD_PER_USD),
        remaining:
          ceiling === undefined
            ? undefined
            : normalizeDecimalUnits(
                Math.max(0, ceiling - used),
                PMPLAN_MICRO_USD_PER_USD,
              ),
        remainingSource: {
          ...source,
          kind: EVIDENCE_KINDS.Derived,
          inputs: [`usage.${key}_limit`, `usage.${key}_used`],
        },
        enabled: true,
        window: { kind: BUDGET_WINDOW_KINDS.Rolling, period },
      }),
    }
  })
  // The first displayed window is the active constraint, never a sum of overlapping caps.
  entries.sort((a, b) => {
    const left = a.constraint.remaining
    const right = b.constraint.remaining
    if (left.status !== OBSERVATION_STATUSES.Known)
      return right.status === OBSERVATION_STATUSES.Known ? 1 : 0
    if (right.status !== OBSERVATION_STATUSES.Known) return -1
    return compareDecimal(left.value, right.value)
  })
  const daily = todayStats(body, request.includeTodayCashflow !== false)
  const records = recentUsage(body.recent_usage)
  return {
    ...accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: ALLOWANCE_COLLECTION_KEY,
          enumeration: FINANCIAL_ENUMERATION.Complete,
          entries,
        },
      ],
      observedAt,
    ),
    subscription: { name: planName, isActive: true },
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.RollingWindow,
      observedAt,
      // monthly_used excludes pre-reset-card usage, unlike these historical
      // counters. Its monetary meaning belongs only to the allowance above.
      totalRequests: requiredCount(usage.requests_30d),
      totalTokens: requiredCount(usage.tokens_30d),
    },
    ...(daily.usage
      ? {
          usageObservations: [
            {
              ...daily.usage,
              observedAt,
              cost: {
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                scope,
                amount: observeAmount(
                  daily.cost,
                  { ...source, operation: "/api/me:daily_usage.cost_micro" },
                  observedAt,
                ),
              },
            },
          ],
        }
      : {}),
    ...(records ? { recentUsageRecords: records } : {}),
    today_quota_consumption: daily.consumption,
    today_requests_count: daily.requests,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_income: 0,
    todayStatsAvailability: daily.availability,
    checkIn: request.checkIn,
  }
}
