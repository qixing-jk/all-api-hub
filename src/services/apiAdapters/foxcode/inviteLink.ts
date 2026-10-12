import type { InviteLinkCapability } from "~/services/apiAdapters/contracts/inviteLink"
import { fetchUserInfo } from "~/services/apiService/foxcode"
import { FOXCODE_ENDPOINTS } from "~/services/apiService/foxcode/constants"
import {
  FOXCODE_CONSOLE_ORIGIN,
  readFoxCode,
  withFoxCodeSession,
} from "~/services/apiService/foxcode/transport"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

export const foxCodeInviteLink: InviteLinkCapability = {
  fetchInviteLink: ({ request }) =>
    withFoxCodeSession(request, async (request) => {
      await fetchUserInfo(request)
      const data = await readFoxCode(request, FOXCODE_ENDPOINTS.Referral)
      if (
        data.enabled !== true ||
        typeof data.referralCode !== "string" ||
        !data.referralCode.trim()
      )
        throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
      return `${FOXCODE_CONSOLE_ORIGIN}/auth/register?aff=${encodeURIComponent(data.referralCode.trim())}`
    }),
}
