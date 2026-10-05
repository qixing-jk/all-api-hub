import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

/**
 * Create invite-link loading for New API-family site types.
 */
export function createNewApiInviteLink(
  siteType?: AccountSiteType,
): InviteLinkCapability {
  if (siteType === SITE_TYPES.LAOZHANG) {
    return {
      async fetchInviteLink({ request }) {
        // https://api2.laozhang.ai/ v31.1.5 constructs /register/?aff_code=.
        const code = await newApiFamilyRequests.data<string>(request, {
          endpoint: "/api/user/aff/",
        })
        if (typeof code !== "string" || !code.trim())
          throw new InviteLinkError(
            INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
          )
        const url = new URL("/register/", request.baseUrl)
        url.searchParams.set("aff_code", code.trim())
        return url.toString()
      },
    }
  }
  return {
    fetchInviteLink: ({ request }) =>
      defaultInviteLinkImplementation.fetchInviteLink(request),
  }
}
