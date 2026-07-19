import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { defaultInviteLinkImplementation } from "~/services/apiService/newApiFamily/default/inviteLink"

/**
 * Create invite-link loading for the canonical New API site type.
 */
export function createNewApiInviteLink(): InviteLinkCapability {
  return {
    fetchInviteLink: ({ request }) =>
      defaultInviteLinkImplementation.fetchInviteLink(request),
  }
}
