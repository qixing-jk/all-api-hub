import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { fetchRelayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

export const relayForAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: async () => true,
  refreshAccount: async (request) => {
    try {
      const data = await fetchRelayForAccountData(request)
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
