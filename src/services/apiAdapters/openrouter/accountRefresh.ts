import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { refreshAccountData } from "~/services/apiService/openrouter"

export const openRouterAccountRefresh: AccountRefreshCapability = {
  refreshAccount: (request) => refreshAccountData(request),
}
