import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
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
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
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
import {
  cubenceNumber,
  invalidCubenceResponse,
  readCubenceResponse,
} from "./transport"

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
    const balance = cubenceNumber(user.normal_balance, CUBENCE_ME_ENDPOINT)
    const scope = accountBalanceScope(request, { walletId: String(user.id) })
    const observedAt = Date.now()
    const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
    const source = {
      adapter: SITE_TYPES.CUBENCE,
      operation: `${CUBENCE_ME_ENDPOINT}:normal_balance`,
      contractVersion: "usd-per-million/v1",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const data: AccountData = {
      ...accountBalanceObservation(
        scope,
        [
          balancePosition({
            id: "normal_balance",
            collectionKey: WALLET_BALANCE_COLLECTION_KEY,
            scope,
            observedAt,
            asset,
            value: normalizeDecimalUnits(balance, CUBENCE_UNITS_PER_USD),
            source,
          }),
        ],
        observedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
      quota: (balance / CUBENCE_UNITS_PER_USD) * QUOTA_PER_USD,
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
      const costObservedAt = Date.now()
      const today = new Date(costObservedAt + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      if (
        body.range !== "today" ||
        body.window_start !== `${today}T00:00:00+08:00` ||
        !isRecord(summary)
      )
        invalidCubenceResponse(TODAY_ENDPOINT)
      const number = (key: string) => {
        const value = cubenceNumber(summary[key], TODAY_ENDPOINT)
        if (value < 0) invalidCubenceResponse(TODAY_ENDPOINT)
        return value
      }
      const cost = number("cost"),
        calls = number("calls"),
        total = number("tokens"),
        output = number("output_tokens")
      if (output > total) invalidCubenceResponse(TODAY_ENDPOINT)
      const start = Date.parse(body.window_start)
      if (costObservedAt > start)
        data.settledConsumption = [
          {
            asset,
            amount: observeAmount(
              normalizeDecimalUnits(cost, CUBENCE_UNITS_PER_USD),
              { ...source, operation: `${TODAY_ENDPOINT}:summary.cost` },
              costObservedAt,
            ),
            scope: accountReportingScope(request, {
              walletId: String(user.id),
            }),
            window: { start, end: costObservedAt, timeZone: "Asia/Shanghai" },
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
            coverage: FINANCIAL_COVERAGE.Complete,
            cumulative: true,
          },
        ]
      data.today_quota_consumption =
        (cost / CUBENCE_UNITS_PER_USD) * QUOTA_PER_USD
      data.today_requests_count = calls
      data.today_prompt_tokens = total - output
      data.today_completion_tokens = output
      for (const key of ["requests", "tokens"] as const)
        data.todayStatsAvailability![key] = {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        }
      data.todayStatsAvailability!.consumption =
        costObservedAt > start
          ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
          : {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
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
