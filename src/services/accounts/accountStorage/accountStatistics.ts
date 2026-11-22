import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import {
  collectAccountMetricContributors,
  createEmptyAccountStats,
  getSiteDayReadings,
} from "~/services/accounts/metrics/accountTodayStats"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStatsResolver"
import { getDisplayBalancePortfolio } from "~/services/accounts/metrics/balanceProjection"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import {
  type AccountStats,
  type AccountTodayStatsAvailability,
  type SiteAccount,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { createLogger } from "~/utils/core/logger"

import { accountPresentation } from "./accountPresentation"
import { accountQueries } from "./accountQueries"

const logger = createLogger("AccountStatistics")

export const calculateAccountStats = (
  accounts: SiteAccount[],
): AccountStats => {
  const enabledAccounts = accounts.filter((account) => !account.disabled)
  const displayAccounts =
    accountPresentation.convertToDisplayData(enabledAccounts)
  const balancePortfolio = getDisplayBalancePortfolio(displayAccounts)
  const usdBalance = balancePortfolio.amounts.find(
    (amount) =>
      amount.asset.kind === ASSET_KINDS.Currency &&
      amount.asset.code === CURRENCIES.USD,
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

  const consumption = getDisplayConsumptionProjection(displayAccounts)
  const now = Date.now()
  const siteDayUsage = enabledAccounts.flatMap((account) => {
    const usages = getSiteDayReadings(
      { ...account.account_info, last_sync_time: account.last_sync_time },
      now,
    )
    return usages.flatMap(({ usage, observedAt, lastKnown }, index) => {
      const amount = usage.cost?.amount
      const hasObservedCost = isKnownOrStaleObservation(amount)
      const cost =
        hasObservedCost &&
        usage.cost &&
        usage.cost.asset.kind !== ASSET_KINDS.Unknown
          ? { asset: usage.cost.asset, value: amount.value }
          : undefined
      if (
        usage.totalRequests === undefined &&
        usage.totalTokens === undefined &&
        !cost
      )
        return []
      return [
        {
          id: usages.length > 1 ? `${account.id}:${index}` : account.id,
          label: account.site_name,
          exchangeRate: account.exchange_rate,
          lastKnown,
          ...(usage.reportedDay ? { reportedDay: usage.reportedDay } : {}),
          ...(observedAt === undefined ? {} : { observedAt }),
          ...(usage.cost?.window ? { window: usage.cost.window } : {}),
          requests: usage.totalRequests,
          tokens: usage.totalTokens,
          cost,
          ...(usage.cost?.coverage
            ? { costCoverage: usage.cost.coverage }
            : {}),
        },
      ]
    })
  })
  const referenceById = new Map(
    displayAccounts.map((account) => [
      account.id,
      account.referenceConsumption,
    ]),
  )
  const referenceConsumption = collect(
    enabledAccounts.filter(
      (account) =>
        !!referenceById.get(account.id) &&
        !referenceById.get(account.id)!.lastKnown,
    ),
    "consumption",
    (account) => referenceById.get(account.id)!.amount.USD * QUOTA_PER_USD,
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
  const income = getDisplayIncomeProjection(displayAccounts)

  return {
    ...(siteDayUsage.length ? { siteDayUsage } : {}),
    // Read-only compatibility projection; canonical native totals stay available below.
    total_quota: Number(usdBalance?.value ?? 0) * QUOTA_PER_USD,
    balancePortfolio,
    consumptionProjection: consumption,
    ...(referenceConsumption.coverage.status !==
      ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
    Number.isFinite(referenceConsumption.value)
      ? {
          referenceTodayConsumption: {
            quota: referenceConsumption.value,
            coverage: {
              ...referenceConsumption.coverage,
              eligibleCount: enabledAccounts.length,
              status:
                referenceConsumption.coverage.completeCount ===
                enabledAccounts.length
                  ? ACCOUNT_TODAY_METRIC_STATUSES.Complete
                  : ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            },
          },
        }
      : {}),
    today_total_consumption: consumption.amount.USD * QUOTA_PER_USD,
    today_total_requests: requests.value,
    today_total_prompt_tokens: promptTokens.value,
    today_total_completion_tokens: completionTokens.value,
    incomeProjection: income,
    today_total_income: income.amount.USD * QUOTA_PER_USD,
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
