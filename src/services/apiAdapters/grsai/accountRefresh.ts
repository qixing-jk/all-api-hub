import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/grsai"

export const grsaiAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: () => fetchSupportCheckIn(),
  refreshAccount: (request) => refreshAccountData(request),
}
