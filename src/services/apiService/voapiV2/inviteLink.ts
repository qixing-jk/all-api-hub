import { fetchVoApiV2Data } from "~/services/apiService/voapiV2/dashboardRequest"
import { isVoApiV2AuthExpiredError } from "~/services/apiService/voapiV2/parsing"
import {
  VOAPI_V2_ENDPOINTS,
  type VoApiV2InviteInfo,
} from "~/services/apiService/voapiV2/type"
import { type ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

/**
 * Fetches the canonical invite URL returned by VoAPI v2.
 * The official feature matrix marks invite friends as Pro-only, while the
 * deployed official client calls this endpoint and copies `data.url` verbatim.
 * The backend source is not public, so runtime errors must continue through the
 * envelope parser.
 * https://github.com/VoAPI/VoAPI/blob/8a9b22f6e5a8d9bdaddeb5454af6629b89dfc802/README_EN.md#L57-L63
 * https://demo.voapi.top/assets/invite-CM31Bfbx.js
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  let inviteInfo: VoApiV2InviteInfo
  try {
    inviteInfo = await fetchVoApiV2Data<VoApiV2InviteInfo>(
      request,
      VOAPI_V2_ENDPOINTS.InviteInfo,
      { method: "GET", cache: "no-store" },
    )
  } catch (error) {
    if (isVoApiV2AuthExpiredError(error)) {
      throw new InviteLinkError(
        INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
        error,
      )
    }
    throw error
  }
  const url =
    inviteInfo &&
    typeof inviteInfo === "object" &&
    !Array.isArray(inviteInfo) &&
    typeof inviteInfo.url === "string"
      ? inviteInfo.url.trim()
      : ""

  if (!url) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  return url
}
