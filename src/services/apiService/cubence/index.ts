import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { parseAllowanceInstant } from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
  accountReportingScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnavailableTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
} from "~/services/amounts/financialConstants"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { isRecord } from "~/utils/core/object"

import { CUBENCE_ME_ENDPOINT, readCubenceUser } from "./identity"
import { withCubenceSession } from "./session"
import { invalidCubenceResponse, readCubenceResponse } from "./transport"

export const CUBENCE_UNITS_PER_USD = 1_000_000
const TODAY_ENDPOINT = "/api/v1/analytics/apikeys/hourly-usage?range=today"

/**
 * Purchased USD credit is distinct from charity credit and discontinued plans.
 * https://docs.cubence.com/en/docs/guides/pricing and console keys: 1 USD = 1e6 units.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withCubenceSession(request, async (scoped) => {
    const user = await readCubenceUser(scoped)
    const observedAt = Date.now()
    const scope = accountBalanceScope(scoped, { walletId: String(user.id) })
    const source = {
      adapter: "cubence",
      operation: CUBENCE_ME_ENDPOINT,
      contractVersion: "micro-usd/v1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const usd = (value: unknown) =>
      normalizeDecimalUnits(value, CUBENCE_UNITS_PER_USD)
    const positions = [
      balancePosition({
        id: "normal",
        labelKey: BALANCE_LABEL_KEYS.Normal,
        collectionKey: "wallets",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: usd(user.normal_balance),
        nature: BALANCE_NATURES.Prepaid,
        funding: BALANCE_FUNDING.Purchased,
        source,
        observedAt,
      }),
      balancePosition({
        id: "charity",
        labelKey: BALANCE_LABEL_KEYS.Charity,
        collectionKey: "wallets",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: usd(user.charity_balance),
        funding: BALANCE_FUNDING.Granted,
        source,
        observedAt,
      }),
    ]
    const data: AccountData = {
      ...accountBalanceObservation(
        scope,
        positions,
        observedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_income: 0,
      todayStatsAvailability: createUnavailableTodayStatsAvailability(
        ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
      ),
      checkIn: request.checkIn,
    }
    data.todayStatsAvailability!.income = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    }
    if (request.includeTodayCashflow === false) return data
    try {
      const body = await readCubenceResponse(scoped, TODAY_ENDPOINT)
      const summary = body.summary
      // The native today window is Asia/Shanghai, not the rolling 24-hour range.
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      if (
        body.range !== "today" ||
        body.window_start !== `${today}T00:00:00+08:00` ||
        !isRecord(summary)
      )
        invalidCubenceResponse(TODAY_ENDPOINT)
      const nativeCost = usd(summary.cost)
      const usageObservedAt = Date.now()
      const costObservation = observeAmount(
        nativeCost,
        { ...source, operation: TODAY_ENDPOINT },
        usageObservedAt,
      )
      const windowStart = parseAllowanceInstant(body.window_start)
      const windowEnd = parseAllowanceInstant(body.as_of)
      if (
        windowStart !== undefined &&
        windowEnd !== undefined &&
        windowStart < windowEnd &&
        windowEnd <= windowStart + 24 * 60 * 60 * 1000 &&
        windowEnd <= Date.now()
      )
        data.settledConsumption = [
          {
            scope: accountReportingScope(scoped, { walletId: String(user.id) }),
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: costObservation,
            window: {
              start: windowStart,
              end: windowEnd,
              timeZone: "Asia/Shanghai",
            },
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
            coverage: FINANCIAL_COVERAGE.Complete,
            cumulative: true,
          },
        ]
      else
        data.usage = {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          observedAt: usageObservedAt,
          cost: {
            scope: accountReportingScope(scoped, { walletId: String(user.id) }),
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: costObservation,
          },
        }
      const counter = (key: string) => {
        const value = summary[key]
        return typeof value === "number" && Number.isFinite(value) && value >= 0
          ? value
          : undefined
      }
      const calls = counter("calls"),
        total = counter("tokens"),
        output = counter("output_tokens")
      const completeTokens =
        total !== undefined && output !== undefined && output <= total
      if (!data.settledConsumption) {
        for (const [key, known] of [
          ["requests", calls !== undefined],
          ["tokens", completeTokens],
        ] as const) {
          data.todayStatsAvailability![key] =
            known && windowStart === usageObservedAt
              ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
              : {
                  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
                  reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
                }
        }
        data.usage = {
          ...data.usage!,
          totalRequests: calls,
          totalTokens: total,
        }
        return data
      }
      data.today_quota_consumption = Number(nativeCost ?? 0) * QUOTA_PER_USD
      data.today_requests_count = calls ?? 0
      data.today_prompt_tokens = completeTokens ? total - output : 0
      data.today_completion_tokens = output ?? 0
      for (const [key, known] of [
        ["consumption", nativeCost !== undefined],
        ["requests", calls !== undefined],
        ["tokens", completeTokens],
      ] as const)
        data.todayStatsAvailability![key] = known
          ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
          : {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
            }
    } catch (error) {
      if (
        request.abortSignal?.aborted ||
        (error instanceof ApiError &&
          (error.statusCode === 401 ||
            error.statusCode === 403 ||
            error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH))
      )
        throw error
      const reason =
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.JSON_PARSE_ERROR
          ? ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload
          : ACCOUNT_TODAY_METRIC_REASONS.RequestFailed
      for (const key of ["consumption", "requests", "tokens"] as const)
        data.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason,
        }
    }
    return data
  })
}

/** Native referral URL; this does not enroll users or withdraw commission. */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  return withCubenceSession(request, async (request) => {
    await readCubenceUser(request)
    const body = await readCubenceResponse(request, "/api/v1/invite/my-code")
    const code = isRecord(body.data) ? body.data.invite_code : undefined
    if (typeof code !== "string" || !code.trim())
      throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
    return `${CUBENCE_WEB_ORIGIN}/signup?code=${encodeURIComponent(code.trim())}`
  })
}
