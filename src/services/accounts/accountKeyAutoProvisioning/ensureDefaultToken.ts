import { getApiService } from "~/services/apiService"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"

export const DEFAULT_AUTO_PROVISION_TOKEN_NAME = "user group (auto)"

/**
 * Generates the default token payload used by key auto-provisioning flows.
 *
 * Default token definition MUST remain stable (see OpenSpec requirements).
 */
export function generateDefaultTokenRequest(): CreateTokenRequest {
  return {
    name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    unlimited_quota: true,
    expired_time: -1, // Never expires
    remain_quota: 0,
    allow_ips: "", // No IP restriction
    model_limits_enabled: false,
    model_limits: "", // All models allowed
    // Empty string follows the user's group
    group: "",
  }
}

/**
 * Ensures that an API token exists for the supplied account by checking the
 * remote token inventory and lazily issuing a default token when none exist.
 *
 * This helper is safe to run in background contexts (no UI dependencies).
 */
export async function ensureDefaultApiTokenForAccount(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<{ token: ApiToken; created: boolean }> {
  const { account, displaySiteData } = params
  const service = getApiService(displaySiteData.siteType)

  const tokens = await service.fetchAccountTokens({
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  })

  let apiToken: ApiToken | undefined = tokens.at(-1)
  if (apiToken) {
    return { token: apiToken, created: false }
  }

  const newTokenData = generateDefaultTokenRequest()
  const createApiTokenResult = await service.createApiToken(
    {
      baseUrl: account.site_url,
      accountId: account.id,
      auth: {
        authType: account.authType,
        userId: account.account_info.id,
        accessToken: account.account_info.access_token,
        cookie: account.cookieAuth?.sessionCookie,
      },
    },
    newTokenData,
  )

  if (!createApiTokenResult) {
    throw new Error("create_token_failed")
  }

  const updatedTokens = await service.fetchAccountTokens({
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  })
  apiToken = updatedTokens.at(-1)

  if (!apiToken) {
    throw new Error("token_not_found")
  }

  return { token: apiToken, created: true }
}
