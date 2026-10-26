import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { fetchAccountData } from "~/services/apiService/requesty"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

export const requestyAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: async () => false,
  refreshAccount: async (request) => {
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
      return {
        success: false,
        healthStatus: determineHealthStatus(error),
      }
    }
  },
}
