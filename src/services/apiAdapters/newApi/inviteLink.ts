import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

/**
 * Create invite-link loading for New API-family site types.
 */
export function createNewApiInviteLink(): InviteLinkCapability {
  return {
    fetchInviteLink: ({ request }) =>
      defaultInviteLinkImplementation.fetchInviteLink(request),
  }
}
