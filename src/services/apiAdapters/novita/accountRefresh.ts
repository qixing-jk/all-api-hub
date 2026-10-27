import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { refreshAccountData } from "~/services/apiService/novita/accountData"

export const novitaAccountRefresh: AccountRefreshCapability = {
  refreshAccount: (request) => refreshAccountData(request),
}
