import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import {
  fetchAccountBalance,
  fetchTodayIncome as fetchTodayIncomeFromNewApiFamily,
  fetchTodayUsage as fetchTodayUsageFromNewApiFamily,
} from "~/services/apiService/newApiFamily/default/accountData"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import {
  getTodayTimestampRange,
  type TodayTimestampRange,
} from "~/services/apiService/newApiFamily/default/accountDataUtils"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamily.DoneHub")

/**
 * DoneHub uses custom pagination and response field names for user log queries.
 */
const DONE_HUB_TODAY_LOG_QUERY_CONFIG: TodayLogQueryConfig = {
  endpoint: "/api/log/self",
  pageParamName: "page",
  pageSizeParamName: "size",
  logTypeParamName: "log_type",
  itemsField: "data",
  totalField: "total_count",
  includeGroupParam: false,
}

/**
 * Fetch DoneHub today's usage through New API-family today-log helpers.
 */
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
) {
  return await fetchTodayUsageFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
    timestampRange,
  )
}

/**
 * Fetch DoneHub today's income through New API-family today-log helpers.
 */
export async function fetchTodayIncome(
  request: ApiServiceAccountRequest,
  timestampRange: TodayTimestampRange = getTodayTimestampRange(),
) {
  return await fetchTodayIncomeFromNewApiFamily(
    request,
    DONE_HUB_TODAY_LOG_QUERY_CONFIG,
    timestampRange,
  )
}

/**
 * Fetch a full DoneHub account snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  // DoneHub captures the check-in configuration before starting its reads.
  return collectAccountData(
    { ...request },
    {
      balance: () => fetchAccountBalance(request),
      usage: (range) => fetchTodayUsage(request, range),
      income: (range) => fetchTodayIncome(request, range),
    },
  )
}

/**
 * Refresh a DoneHub account and convert failures to health status metadata.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request),
    (error) => logger.error("DoneHub 刷新账号数据失败", error),
  )
}
