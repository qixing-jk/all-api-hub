import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import {
  fetchAccountBalance,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamily.Veloera")

export { fetchSupportCheckIn } from "./veloeraCheckIn"

/**
 * Fetch and aggregate all Veloera account data.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return collectAccountData(request, {
    balance: () => fetchAccountBalance(request),
    usage: (range) => fetchTodayUsage(request, undefined, range),
    income: (range) => fetchTodayIncome(request, undefined, range),
  })
}

/**
 * Refresh Veloera account data with normalized health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request),
    (error) => logger.error("刷新账号数据失败", error),
  )
}
