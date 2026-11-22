import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { budgetConstraint, type BudgetWindow } from "~/services/amounts/budgets"
import {
  compareDecimal,
  normalizeDecimalUnits,
} from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { ACCOUNT_TODAY_METRIC_REASONS } from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import {
  FOXCODE_ENDPOINTS,
  FOXCODE_NON_RESETTING_PLAN,
  FOXCODE_UNITS_PER_USD,
} from "./constants"
import { parseFoxCodeIdentity } from "./identity"
import {
  invalidFoxCodeResponse,
  readFoxCode,
  withFoxCodeSession,
} from "./transport"
import { fetchRecentUsage } from "./usage"

export { FOXCODE_UNITS_PER_USD } from "./constants"
/** Reject missing or malformed monetary facts instead of displaying zero. */
export function foxCodeAmount(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw invalidFoxCodeResponse(endpoint)
  return value
}

/** Validate the live console identity before returning any saved-account facts. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const endpoint = FOXCODE_ENDPOINTS.Identity
  const user = parseFoxCodeIdentity({
    success: true,
    data: await readFoxCode(request, endpoint),
  })
  if (!user) throw invalidFoxCodeResponse(endpoint)
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId).trim() &&
    String(request.auth.userId) !== user.id
  )
    throw new ApiError(
      "FoxCode account identity mismatch",
      undefined,
      endpoint,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Accept dashboard facts only for the verified saved identity. */
export async function fetchDashboard(request: ApiServiceRequest) {
  return withFoxCodeSession(request, async (request) => {
    const user = await fetchUserInfo(request)
    const data = await readFoxCode(request, FOXCODE_ENDPOINTS.Dashboard)
    const identity = parseFoxCodeIdentity({ success: true, data })
    if (!identity) throw invalidFoxCodeResponse(FOXCODE_ENDPOINTS.Dashboard)
    if (identity.id !== user.id)
      throw new ApiError(
        "FoxCode dashboard identity mismatch",
        undefined,
        FOXCODE_ENDPOINTS.Dashboard,
        API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      )
    return data
  })
}

/** Plans retain their individual USD constraints; a non-resetting plan is not proof of a wallet. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withFoxCodeSession(request, async (request) => {
    const dashboard = await fetchDashboard(request)
    const endpoint = FOXCODE_ENDPOINTS.Dashboard
    if (
      !isRecord(dashboard.subscription) ||
      !Array.isArray(dashboard.subscription.active)
    )
      throw invalidFoxCodeResponse(endpoint)
    const observedAt = Date.now()
    const scope = accountBalanceScope(request)
    const source = {
      adapter: "foxcode",
      operation: endpoint,
      contractVersion: "plan-usd/v1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const usd = (value: unknown) => {
      const amount = normalizeDecimalUnits(value, FOXCODE_UNITS_PER_USD)
      return amount === undefined || compareDecimal(amount, "0") < 0
        ? undefined
        : amount
    }
    const entries: AccountAllowanceEntry[] = dashboard.subscription.active.map(
      (raw, index) => {
        const value = isRecord(raw) ? raw : {}
        const plan = isRecord(value.plan) ? value.plan : {}
        const reportedId =
          typeof value.id === "string" && value.id.trim()
            ? value.id
            : typeof value.id === "number" && Number.isSafeInteger(value.id)
              ? String(value.id)
              : undefined
        const expiry = parseAllowanceInstant(value.endDate)
        const reset = plan.resetType
        const period =
          reset === "DAILY"
            ? "day"
            : reset === "WEEKLY"
              ? "week"
              : reset === "MONTHLY"
                ? "month"
                : reset === "YEARLY"
                  ? "year"
                  : undefined
        const window: BudgetWindow =
          reset === FOXCODE_NON_RESETTING_PLAN
            ? { kind: BUDGET_WINDOW_KINDS.Lifetime }
            : period
              ? { kind: BUDGET_WINDOW_KINDS.Periodic, period }
              : { kind: BUDGET_WINDOW_KINDS.Unknown }
        return {
          id: reportedId ?? `unidentified:${observedAt}:${index}`,
          identityKind: reportedId
            ? ALLOWANCE_IDENTITY_KINDS.Upstream
            : ALLOWANCE_IDENTITY_KINDS.ObservationOnly,
          collectionKey: "active-plans",
          label: typeof plan.name === "string" ? plan.name : undefined,
          validity:
            expiry !== undefined
              ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiry }
              : { kind: BALANCE_VALIDITY_KINDS.Unknown },
          ...(typeof value.endDate === "string"
            ? { reportedTiming: { expiresAt: value.endDate } }
            : {}),
          constraint: budgetConstraint({
            scope,
            source,
            observedAt,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            limitState: BUDGET_LIMIT_STATES.Finite,
            limit: usd(plan.quotaLimit),
            used: usd(value.quotaUsed),
            remaining: usd(value.quotaRemaining),
            enabled: true,
            window,
          }),
        }
      },
    )
    let recentUsageRecords
    if (request.includeTodayCashflow !== false) {
      try {
        recentUsageRecords = await fetchRecentUsage(request)
      } catch (error) {
        if (
          request.abortSignal?.aborted ||
          (error instanceof ApiError &&
            (error.statusCode === 401 ||
              error.statusCode === 403 ||
              error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH))
        )
          throw error
        // Optional usage failure must not turn a verified balance into zero or fabricated empty history.
      }
    }
    return {
      ...accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "active-plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries,
          },
        ],
        observedAt,
      ),
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      // The rolling 24-hour chart and client-side zero defaults do not establish today's totals.
      todayStatsAvailability: createUnavailableTodayStatsAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      ),
      ...(entries.length
        ? {
            subscription: {
              name: entries
                .flatMap((entry) => (entry.label ? [entry.label] : []))
                .join(" / "),
              billingType: "quota",
              isActive: true,
            },
          }
        : {}),
      checkIn: request.checkIn,
      ...(recentUsageRecords !== undefined ? { recentUsageRecords } : {}),
    }
  })
}
