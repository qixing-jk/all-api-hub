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
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamily.AnyRouter")

/**
 * AnyRouter always supports the check-in workflow.
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return true
}

/**
 * Fetch complete AnyRouter account data.
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
 * Refresh AnyRouter account data with normalized health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request),
    (error) => logger.error("刷新账号数据失败", error),
  )
}
