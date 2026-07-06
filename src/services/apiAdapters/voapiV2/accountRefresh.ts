import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/voapiV2"

export const voApiV2AccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
