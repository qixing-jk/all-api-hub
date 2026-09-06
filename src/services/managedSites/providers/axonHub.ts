import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import * as axonHubApi from "~/services/apiService/axonHub"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { fetchManagedSiteAvailableModels } from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"
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
 * Return the AxonHub config in the shared managed-site service shape.
 */
export async function getAxonHubConfig(): Promise<ManagedSiteConfig | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    if (hasValidAxonHubConfig(prefs) && prefs.axonHub) {
      return prefs.axonHub
    }
    return null
  } catch (error) {
    logger.error("Error getting AxonHub config", error)
    return null
  }
}

/**
 * Fetch models available to the source account token for AxonHub imports.
 */
export async function fetchAvailableModels(
  account: DisplaySiteData,
  token: ApiToken,
): Promise<string[]> {
  return await fetchManagedSiteAvailableModels(account, token, {
    includeAccountFallback: false,
  })
}

/**
 * Build the default AxonHub imported-channel name.
 */
export function buildChannelName(
  account: DisplaySiteData,
  token: ApiToken,
): string {
  let channelName = `${account.name} | ${token.name}`.trim()
  if (!channelName.endsWith("(auto)")) {
    channelName += " (auto)"
  }
  return channelName
}

/**
 * Prepare AxonHub channel form data from an account/token pair.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ChannelFormData> {
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  return {
    name: buildChannelName(account, token),
    type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [],
    priority: 0,
    weight: 0,
    status: CHANNEL_STATUS.Enable,
  }
}
