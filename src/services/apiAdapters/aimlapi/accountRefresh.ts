import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { fetchAimlApiAccountData } from "~/services/apiService/aimlapi/accountData"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

export const aimlApiAccountRefresh: AccountRefreshCapability = {
  // AI/ML API has no check-in programme.
  fetchCheckInSupport: async () => false,
  refreshAccount: async (request) => {
    try {
      return {
        success: true,
        data: await fetchAimlApiAccountData(request),
        healthStatus: {
          status: SiteHealthStatus.Healthy,
          message: t("account:healthStatus.normal"),
        },
      }
    } catch (error) {
      return { success: false, healthStatus: determineHealthStatus(error) }
    }
  },
}
