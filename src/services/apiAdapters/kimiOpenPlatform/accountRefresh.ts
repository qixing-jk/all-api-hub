import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { fetchKimiAccountData } from "~/services/apiService/kimiOpenPlatform"
import { readKimiAuthState } from "~/services/apiService/kimiOpenPlatform/transport"
import { getKimiOpenPlatformAuthConfig } from "~/services/kimiOpenPlatform/auth"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

export const kimiOpenPlatformAccountRefresh: AccountRefreshCapability = {
  refreshAccount: async (request) => {
    try {
      const data = await fetchKimiAccountData(request)
      const state = readKimiAuthState(request)
      return {
        success: true as const,
        data,
        healthStatus: {
          status: SiteHealthStatus.Healthy,
          message: t("account:healthStatus.normal"),
        },
        ...(state
          ? {
              authUpdate: {
                accessToken: state.accessToken,
                kimiOpenPlatformAuth: getKimiOpenPlatformAuthConfig(state),
              },
            }
          : {}),
      }
    } catch (error) {
      return {
        success: false as const,
        healthStatus: determineHealthStatus(error),
      }
    }
  },
}
