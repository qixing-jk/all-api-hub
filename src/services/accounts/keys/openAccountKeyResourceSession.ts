import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import type { ResourceOperationOptions } from "~/services/apiAdapters/contracts/resourceNative"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"

/** Opens native key capabilities with the caller's execution policy, without listing resources. */
export async function openAccountKeyResourceSession(
  account: DisplaySiteData,
  protectionBypassExecution: ProtectionBypassExecution,
  options: ResourceOperationOptions,
) {
  const context = createDisplayAccountApiContext(account)
  if (!context.accountKeyResources) return null
  return context.accountKeyResources.open(
    {
      account: {
        id: account.id,
        name: account.name,
        siteType: account.siteType,
      },
      request: bindApiTransportRequest(
        { ...context.request, protectionBypassExecution },
        API_DIRECT_REQUEST_REASONS.CallerManaged,
      ),
    },
    options,
  )
}
