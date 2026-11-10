import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { SiteAccount } from "~/types"

import type { AutoCheckinProviderContext } from "./contracts"

/** Preserves stored account auth while binding this check-in's recovery and mutation evidence. */
export function createAccountCheckInRequest(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
) {
  return bindApiTransportRequest(
    {
      ...createAccountApiRequestFromStoredAccount(account).request,
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
      observer: context.mutationLifecycle,
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )
}
