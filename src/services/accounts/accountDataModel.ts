import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  CheckInConfig,
  SiteHealthStatus,
  TempWindowHealthStatusCode,
  type AccountIdentity,
  type AccountSubscriptionSummary,
  type AccountTodayStatsAvailability,
  type AccountUsageRecord,
  type AccountUsageSummary,
  type Sub2ApiAuthConfig,
} from "~/types"

export interface TodayUsageData {
  today_quota_consumption: number
  today_prompt_tokens: number
  today_completion_tokens: number
  today_requests_count: number
}

export interface TodayIncomeData {
  today_income: number
}

export type TodayStatsData = TodayUsageData & TodayIncomeData

export type TodayUsageDataWithAvailability = TodayUsageData & {
  todayStatsAvailability: Pick<
    AccountTodayStatsAvailability,
    "consumption" | "requests" | "tokens"
  >
}

export type TodayIncomeDataWithAvailability = TodayIncomeData & {
  todayStatsAvailability: Pick<AccountTodayStatsAvailability, "income">
}

export interface AccountData extends TodayStatsData {
  quota: number
  todayStatsAvailability?: AccountTodayStatsAvailability
  usage?: AccountUsageSummary
  subscription?: AccountSubscriptionSummary
  recentUsageRecords?: AccountUsageRecord[]
  /**
   * Legacy flag indicating whether the account can be checked in today.
   * @deprecated Use `checkIn.siteStatus.isCheckedInToday` instead.
   */
  can_check_in?: boolean
  checkIn: CheckInConfig
}

/**
 * Account-data related requests must include check-in config.
 *
 * Note: we keep `ApiServiceRequest` as the minimal/common request DTO, and only
 * extend it for flows that actually need extra fields (like check-in).
 */
export type ApiServiceAccountRequest = ApiServiceRequest & {
  checkIn: CheckInConfig
  /**
   * Account-owned exchange rate (CNY per USD) used when parsing recharge/system
   * log text into quota units.
   *
   * The API service layer consumes this value but does not resolve it from
   * account storage.
   */
  exchangeRate?: number
  /**
   * Whether account refresh should include fetching "today cashflow" statistics
   * (today consumption/income plus token/request counts).
   *
   * When false, API services MUST skip the log pagination requests used solely
   * for today stats and return zeroed today fields instead.
   *
   * Default: true (when undefined).
   */
  includeTodayCashflow?: boolean
}

type RefreshAuthUpdate = {
  accessToken?: string
  userId?: AccountIdentity
  username?: string
  sub2apiAuth?: Sub2ApiAuthConfig
}

type RefreshAccountResultBase = {
  healthStatus: HealthCheckResult
  /**
   * Optional auth/identity updates discovered during refresh.
   *
   * This is used by site implementations that can re-sync credentials from a
   * browser context (e.g., Sub2API JWT stored in localStorage) without
   * re-authenticating the user.
   */
  authUpdate?: RefreshAuthUpdate
}

export type RefreshAccountResult =
  | (RefreshAccountResultBase & {
      success: true
      data: AccountData
    })
  | (RefreshAccountResultBase & {
      success: false
      data?: never
    })

export interface HealthCheckResult {
  status: SiteHealthStatus
  message: string
  /**
   * Optional machine-readable reason code for actionable UI.
   */
  code?: TempWindowHealthStatusCode
}
