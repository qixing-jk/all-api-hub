import type {
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { fetchAccountData } from "~/services/apiService/newApiFamily/default/accountData"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilyAccountRefresh")

interface AccountRefreshImplementation {
  fetchSupportCheckIn: (
    request: ApiServiceRequest,
  ) => Promise<boolean | undefined>
  refreshAccountData: (
    request: ApiServiceAccountRequest,
  ) => Promise<RefreshAccountResult>
}

/**
 * Refresh the default New API-family account snapshot and health state.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
  queryConfig?: TodayLogQueryConfig,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request, queryConfig),
    (error) => logger.error("刷新账号数据失败", error),
  )
}

export const defaultAccountRefreshImplementation: AccountRefreshImplementation =
  {
    fetchSupportCheckIn,
    refreshAccountData,
  }
