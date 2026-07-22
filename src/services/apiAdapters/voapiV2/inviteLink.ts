import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { fetchInviteLink } from "~/services/apiService/voapiV2"

export const voApiV2InviteLink: InviteLinkCapability = {
  fetchInviteLink: ({ request }) => fetchInviteLink(request),
}
