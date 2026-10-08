import type { AccountSiteType } from "~/constants/siteType"
import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

/** Admits the site's complete invitation operation before default orchestration. */
export function createNewApiInviteLink(
  siteType?: AccountSiteType,
): InviteLinkCapability {
  return (
    getNewApiVariantRegistration(siteType).inviteLink ?? {
      fetchInviteLink: ({ request }) =>
        defaultInviteLinkImplementation.fetchInviteLink(request),
    }
  )
}
