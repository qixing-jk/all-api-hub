import {
  CheckInConfig,
  SiteHealthStatus,
  TempWindowHealthStatusCode,
  type AccountIdentity,
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

export interface AccountData extends TodayStatsData {
  quota: number
  /**
   * Legacy flag indicating whether the account can be checked in today.
   * @deprecated Use `checkIn.siteStatus.isCheckedInToday` instead.
   */
  can_check_in?: boolean
  checkIn: CheckInConfig
}

export interface RefreshAccountResult {
  success: boolean
  data?: AccountData
  healthStatus: HealthCheckResult
  /**
   * Optional auth/identity updates discovered during refresh.
   *
   * This is used by site implementations that can re-sync credentials from a
   * browser context (e.g., Sub2API JWT stored in localStorage) without
   * re-authenticating the user.
   */
  authUpdate?: {
    accessToken?: string
    userId?: AccountIdentity
    username?: string
    sub2apiAuth?: Sub2ApiAuthConfig
  }
}

export interface HealthCheckResult {
  status: SiteHealthStatus
  message: string
  /**
   * Optional machine-readable reason code for actionable UI.
   */
  code?: TempWindowHealthStatusCode
}
