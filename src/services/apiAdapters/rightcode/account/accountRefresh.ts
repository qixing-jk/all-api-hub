import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/rightcode"

export const rightCodeAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: () => fetchSupportCheckIn(),
  refreshAccount: (request) => refreshAccountData(request),
}
