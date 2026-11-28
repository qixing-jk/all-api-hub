import { fetchPmApiIdentity } from "~/services/apiService/pmapi/identity"
import type { SiteAccount } from "~/types"

import type { AutoCheckinProviderContext } from "./contracts"
import { clickNativeCheckInPageAction } from "./nativeCheckInPageAction"

/** Uses PM-API's native button and identity reader for one confirmed check-in attempt. */
export function clickNativeCheckInPage(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
) {
  return clickNativeCheckInPageAction(account, context, {
    selector: "#ckBtn:not(:disabled)",
    requestIdPrefix: "pmapi-checkin",
    discoverCheckInPage: true,
    readStatus: fetchPmApiIdentity,
  })
}
