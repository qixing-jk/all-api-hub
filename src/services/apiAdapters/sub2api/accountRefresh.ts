import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/sub2api"

export const sub2ApiAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
