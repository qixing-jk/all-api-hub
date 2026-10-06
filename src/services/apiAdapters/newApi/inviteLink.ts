import type { AccountSiteType } from "~/constants/siteType"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

import type { InviteLinkCapability } from "../contracts/inviteLink"
import { getNewApiVariantRegistration } from "./variantRegistration"

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
