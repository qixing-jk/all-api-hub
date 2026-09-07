import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import * as axonHubApi from "~/services/apiService/axonHub"
import { buildManagedSiteChannelName } from "~/services/managedSites/utils/channelDraft"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import { type ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("AxonHubService")

/**
 * Check whether preferences contain a complete AxonHub admin config.
 */
function hasValidAxonHubConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.axonHub) return false
  const { baseUrl, email, password } = prefs.axonHub
  return Boolean(baseUrl?.trim() && email?.trim() && password?.trim())
}
/**
 * Validate the saved AxonHub admin config by signing in.
 */
export async function checkValidAxonHubConfig(): Promise<boolean> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidAxonHubConfig(prefs) || !prefs.axonHub) {
      return false
    }
    const config = prefs.axonHub
    await axonHubApi.signIn(config)
    return true
  } catch (error) {
    logger.warn("AxonHub config validation failed", error)
    return false
  }
}

/**
 * Prepare AxonHub channel form data from an account/token pair.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ManagedSiteChannelDraft> {
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  return {
    name: buildManagedSiteChannelName(account, token),
    type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [],
    priority: 0,
    weight: 0,
    enabled: true,
  }
}
