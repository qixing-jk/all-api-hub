import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type InviteLinkRequest = {
  request: ApiServiceRequest
}

export type InviteLinkCapability = {
  fetchInviteLink(request: InviteLinkRequest): Promise<string>
}
