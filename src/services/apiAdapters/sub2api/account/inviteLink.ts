import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { fetchInviteLink } from "~/services/apiService/sub2api/account/inviteLink"

export const sub2ApiInviteLink: InviteLinkCapability = {
  fetchInviteLink: ({ request }) => fetchInviteLink(request),
}
