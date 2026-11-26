import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

export const shellApiInviteLink: InviteLinkCapability = {
  async fetchInviteLink({ request }) {
    // Shell demo and hosted consoles construct /register/?aff_code=.
    const code = await newApiFamilyRequests.data<string>(request, {
      endpoint: "/api/user/aff/",
    })
    if (typeof code !== "string" || !code.trim())
      throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
    const url = new URL("/register/", request.baseUrl)
    url.searchParams.set("aff_code", code.trim())
    return url.toString()
  },
}
