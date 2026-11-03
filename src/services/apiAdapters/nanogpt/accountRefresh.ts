import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { fetchAccountData } from "~/services/apiService/nanogpt"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

export const nanoGptAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: async () => false,
  refreshAccount: async (request) => {
    try {
      return {
        success: true,
        data: await fetchAccountData(request),
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
