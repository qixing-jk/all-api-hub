import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

/**
 * Create invite-link loading bound to the New API-family site type.
 */
export function createNewApiInviteLink(): InviteLinkCapability {
  return {
    fetchInviteLink: ({ request }) =>
      defaultInviteLinkImplementation.fetchInviteLink(request),
  }
}
