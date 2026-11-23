import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

/** Admits the site's complete invitation operation before default orchestration. */
export function createNewApiInviteLink(
  siteType?: AccountSiteType,
): InviteLinkCapability {
  return (
    getCompatibleAccountVariant(siteType).inviteLink ?? {
      fetchInviteLink: ({ request }) =>
        defaultInviteLinkImplementation.fetchInviteLink(request),
    }
  )
}
