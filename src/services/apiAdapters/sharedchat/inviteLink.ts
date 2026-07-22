import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { fetchInviteLink } from "~/services/apiService/sharedchat"

export const sharedChatInviteLink: InviteLinkCapability = {
  fetchInviteLink: ({ request }) => fetchInviteLink(request),
}
