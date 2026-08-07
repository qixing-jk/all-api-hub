import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { refreshAccountData } from "~/services/apiService/orcarouter"

export const orcaRouterAccountRefresh: AccountRefreshCapability = {
  refreshAccount: (request) => refreshAccountData(request),
}
