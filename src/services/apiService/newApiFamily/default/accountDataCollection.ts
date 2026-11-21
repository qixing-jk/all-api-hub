import type {
  AccountData,
  ApiServiceAccountRequest,
  TodayIncomeDataWithAvailability,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"

import {
  getTodayTimestampRange,
  type TodayTimestampRange,
} from "./accountDataUtils"

type AccountDataSources = {
  balance: () => Promise<Pick<AccountData, "balance" | "balanceRefreshParts">>
  usage: (
    range: TodayTimestampRange,
  ) => Promise<
    TodayUsageDataWithAvailability & Pick<AccountData, "settledConsumption">
  >
  income: (
    range: TodayTimestampRange,
  ) => Promise<
    TodayIncomeDataWithAvailability & Pick<AccountData, "reportedIncome">
  >
}

/** Read independent sources concurrently against one frozen local-day range. */
export async function collectAccountData(
  request: ApiServiceAccountRequest,
  sources: AccountDataSources,
): Promise<AccountData> {
  const range = getTodayTimestampRange()
  const [balance, usage, income] = await Promise.all([
    sources.balance(),
    sources.usage(range),
    sources.income(range),
  ])
  return {
    ...balance,
    ...usage,
    ...income,
    todayStatsAvailability: {
      ...usage.todayStatsAvailability,
      ...income.todayStatsAvailability,
    },
    checkIn: request.checkIn,
  }
}
