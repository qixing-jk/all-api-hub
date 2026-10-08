import { fetchSub2ApiData } from "~/services/apiService/sub2api/account/dashboardRequest"
import { fetchSub2ApiPublicSettings } from "~/services/apiService/sub2api/account/publicSettings"
import {
  SUB2API_AFFILIATE_ENDPOINT,
  type Sub2ApiAffiliateData,
} from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

/**
 * Fetch an opt-in Sub2API affiliate link from the deployment that owns the account.
 * The settings route is public, while the affiliate detail route uses the saved
 * dashboard JWT; the frontend builds a same-origin `/register?aff=` URL.
 * https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/handler/setting_handler.go
 * https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/handler/user_handler.go
 * https://github.com/Wei-Shaw/sub2api/blob/main/frontend/src/views/user/AffiliateView.vue
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const publicSettings = await fetchSub2ApiPublicSettings(request)

  if (
    !publicSettings ||
    typeof publicSettings !== "object" ||
    Array.isArray(publicSettings) ||
    typeof publicSettings.affiliate_enabled !== "boolean"
  ) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InvalidResponse)
  }

  if (!publicSettings.affiliate_enabled) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.FeatureDisabled)
  }

  const affiliate = await fetchSub2ApiData<Sub2ApiAffiliateData>(
    request,
    SUB2API_AFFILIATE_ENDPOINT,
    { method: "GET", cache: "no-store" },
    { allowMissingData: true },
  )
  const inviteCode =
    affiliate &&
    typeof affiliate === "object" &&
    !Array.isArray(affiliate) &&
    typeof affiliate.aff_code === "string"
      ? affiliate.aff_code.trim()
      : ""

  if (!inviteCode) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  const origin = new URL(request.baseUrl).origin
  return `${origin}/register?aff=${encodeURIComponent(inviteCode)}`
}
