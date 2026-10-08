import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/aihubmix"

export const aihubmixAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
