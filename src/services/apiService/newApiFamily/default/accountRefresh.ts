import type {
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { fetchAccountData } from "~/services/apiService/newApiFamily/default/accountData"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

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
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("刷新账号数据失败", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}

export const defaultAccountRefreshImplementation: AccountRefreshImplementation =
  {
    fetchSupportCheckIn,
    refreshAccountData,
  }
