import {
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

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
  const adapter = getSiteAdapter(displaySiteData.siteType)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    adapter.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    adapter.tokenProvisioning,
  )
  const displayAccountRequest = {
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
  const createAccountRequest = {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }

  const tokens = await keyManagement.fetchTokens(displayAccountRequest)

  let apiToken: ApiToken | undefined = tokens.at(-1)
  if (apiToken) {
    return { token: apiToken, created: false }
  }

  const decision = tokenProvisioning.resolveDefaultTokenCreation({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
    defaultTokenData: generateDefaultTokenRequest(),
  })

  if (decision.kind !== "create") {
    if (
      decision.kind === "blocked" &&
      decision.reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
    ) {
      throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
    }

    throw new Error(t("messages:sub2api.createRequiresGroup"))
  }

  const createApiTokenResult = await keyManagement.createToken(
    createAccountRequest,
    decision.tokenData,
  )
  const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
    result: createApiTokenResult,
  })

  if (createdTokenDecision.kind === "usable") {
    return { token: createdTokenDecision.token, created: true }
  }

  if (createdTokenDecision.kind === "failed") {
    throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
  }

  if (createdTokenDecision.kind === "unavailable") {
    throw new Error(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
  }

  // Backends such as AIHubMix may only expose the full API key in the create
  // response; a follow-up inventory fetch can return a masked key that cannot
  // be revealed later. This helper currently returns inventory data only.
  const updatedTokens = await keyManagement.fetchTokens(displayAccountRequest)
  apiToken = updatedTokens.at(-1)

  if (!apiToken) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
  }

  return { token: apiToken, created: true }
}
