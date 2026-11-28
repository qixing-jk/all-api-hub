import { fetchPmplanCheckInStatus } from "~/services/apiService/pmplan/checkIn"
import type { SiteAccount } from "~/types"

import type { AutoCheckinProviderContext } from "./contracts"
import { clickNativeCheckInPageAction } from "./nativeCheckInPageAction"

/** Opens PM-Plan's verified native action and confirms completion through its dashboard. */
export function clickPmplanCheckInPage(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
) {
  return clickNativeCheckInPageAction(account, context, {
    selector: 'button[data-action="checkin"]:not(:disabled)',
    requestIdPrefix: "pmplan-checkin",
    readStatus: fetchPmplanCheckInStatus,
  })
}
