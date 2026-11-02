import { SITE_TYPES } from "~/constants/siteType"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchAimlApiBillingDetail } from "~/services/apiService/aimlapi/accountData"
import { fetchAimlApiLatestKey } from "~/services/apiService/aimlapi/keys"
import { ensureAimlApiKey } from "~/services/apiService/aimlapi/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"

/**
 * Resolves the saved account identity.
 *
 * `/v2/billing/detail` is the only route that names the account, and it needs
 * the regular API key. Without one the account is still valid — key management
 * works with the management key alone — so identity falls back to the
 * management key's own prefix instead of failing the save.
 */
export async function fetchAimlApiUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  // Validate the primary credential even when billing supplies the identity.
  const latest = await fetchAimlApiLatestKey(request)
  const apiKey = await ensureAimlApiKey(request)
  if (apiKey) {
    const detail = await fetchAimlApiBillingDetail({
      ...request,
      checkIn: buildIdentityCheckInConfig(),
      aimlApiKey: apiKey,
    })
    return {
      id: String(detail.userId),
      username: detail.email?.trim() || String(detail.userId),
      access_token: request.auth.accessToken ?? "",
    }
  }

  // No regular key: prove the management key works before using it as identity.
  return {
    id: latest.prefix,
    username: latest.name?.trim() || latest.prefix,
    access_token: request.auth.accessToken ?? "",
  }
}

/** Identity reads carry no check-in state; the shared helper keeps the shape valid. */
function buildIdentityCheckInConfig() {
  return createCompatibilityCheckInConfig({
    siteType: SITE_TYPES.AIMLAPI,
    supported: false,
    automaticExecutionEnabled: false,
  })
}
