import {
  collectAccountMetricContributors,
  createEmptyAccountStats,
} from "~/services/accounts/accountTodayStats"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStatsResolver"
import type {
  AccountStats,
  AccountTodayStatsAvailability,
  SiteAccount,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { createLogger } from "~/utils/core/logger"

import { accountQueries } from "./accountQueries"

const logger = createLogger("AccountStatistics")

export const calculateAccountStats = (
  accounts: SiteAccount[],
): AccountStats => {
  const enabledAccounts = accounts.filter((account) => !account.disabled)
  const balanceAccounts = enabledAccounts.filter(
    (account) => account.excludeFromTotalBalance !== true,
  )
  const incomeAccounts = enabledAccounts.filter(
    (account) => account.excludeFromTodayIncome !== true,
  )
  const availabilityById = new Map(
    enabledAccounts.map((account) => [
      account.id,
      resolveAccountTodayStatsAvailability(account),
    ]),
  )
  const collect = (
    eligibleAccounts: SiteAccount[],
    metric: keyof AccountTodayStatsAvailability,
    getValue: (account: SiteAccount) => number,
  ) =>
    collectAccountMetricContributors(
      eligibleAccounts,
      getValue,
      (account) => availabilityById.get(account.id)![metric],
    )

  const consumption = collect(
    enabledAccounts,
    "consumption",
    (account) => account.account_info.today_quota_consumption,
  )
  const requests = collect(
    enabledAccounts,
    "requests",
    (account) => account.account_info.today_requests_count,
  )
  const tokenContributors = enabledAccounts.map((account) => {
    const availability = availabilityById.get(account.id)!.tokens
    const hasFiniteValues =
      Number.isFinite(account.account_info.today_prompt_tokens) &&
      Number.isFinite(account.account_info.today_completion_tokens)
    return {
      account,
      availability:
        hasFiniteValues ||
        availability.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
          ? availability
          : {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
            },
    }
  })
  const promptTokens = collectAccountMetricContributors(
    tokenContributors,
    ({ account }) => account.account_info.today_prompt_tokens,
    ({ availability }) => availability,
  )
  const completionTokens = collectAccountMetricContributors(
    tokenContributors,
    ({ account }) => account.account_info.today_completion_tokens,
    ({ availability }) => availability,
  )
  const income = collect(
    incomeAccounts,
    "income",
    (account) => account.account_info.today_income,
  )

  return {
    total_quota: balanceAccounts.reduce(
      (sum, account) => sum + account.account_info.quota,
      0,
    ),
    today_total_consumption: consumption.value,
    today_total_requests: requests.value,
    today_total_prompt_tokens: promptTokens.value,
    today_total_completion_tokens: completionTokens.value,
    today_total_income: income.value,
    todayStatsCoverage: {
      consumption: consumption.coverage,
      requests: requests.coverage,
      tokens: promptTokens.coverage,
      income: income.coverage,
    },
  }
}

class AccountStatistics {
  async getAccountStats(): Promise<AccountStats> {
    try {
      return calculateAccountStats(await accountQueries.getEnabledAccounts())
    } catch (error) {
      logger.error("计算统计信息失败", error)
      return createEmptyAccountStats()
    }
  }
}

export const accountStatistics = new AccountStatistics()
