import { SITE_TYPES } from "~/constants/siteType"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchAimlApiBillingDetail } from "~/services/apiService/aimlapi/accountData"
import { fetchAimlApiLatestKey } from "~/services/apiService/aimlapi/keys"
import { ensureAimlApiKey } from "~/services/apiService/aimlapi/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"

import {
  AIMLAPI_CONNECTION_KEY_KINDS,
  forgetInvalidAimlApiConnectionKey,
} from "./connectionCredentials"

/** A 401 proves this exact credential invalid; network and scope failures do not. */
async function verifyCredential<T>(
  kind: "management" | "regular",
  key: string,
  verify: () => Promise<T>,
): Promise<T> {
  try {
    return await verify()
  } catch (error) {
    if (error instanceof ApiError && error.code === API_ERROR_CODES.HTTP_401) {
      // Cleanup failure must preserve the original verification error.
      await forgetInvalidAimlApiConnectionKey(kind, key).catch(() => undefined)
    }
    throw error
  }
}

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
  const latest = await verifyCredential(
    AIMLAPI_CONNECTION_KEY_KINDS.Management,
    request.auth.accessToken?.trim() ?? "",
    () => fetchAimlApiLatestKey(request),
  )
  const apiKey = await ensureAimlApiKey(request)
  if (apiKey) {
    const detail = await verifyCredential(
      AIMLAPI_CONNECTION_KEY_KINDS.Regular,
      apiKey,
      () =>
        fetchAimlApiBillingDetail({
          ...request,
          checkIn: buildIdentityCheckInConfig(),
          aimlApiKey: apiKey,
        }),
    )
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
