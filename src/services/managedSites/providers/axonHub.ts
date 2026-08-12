import {
  AXON_HUB_CHANNEL_TYPE,
  DEFAULT_AXON_HUB_CHANNEL_FIELDS,
} from "~/constants/axonHub"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import type { ManagedSiteChannelRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import * as axonHubApi from "~/services/apiService/axonHub"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { fetchManagedSiteAvailableModels } from "~/services/managedSites/utils/fetchManagedSiteAvailableModels"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type { AxonHubCreateChannelInput } from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type ChannelFormData,
  type ChannelMode,
  type CreateChannelPayload,
  type ManagedSiteChannelListData,
} from "~/types/managedSite"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

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

const getFinalModels = (formData: ChannelFormData) =>
  normalizeList(formData.models ?? [])

/**
 * Build an AxonHub create-channel input from normalized dialog form data.
 */
function buildAxonHubInputFromFormData(
  formData: ChannelFormData,
): AxonHubCreateChannelInput {
  const models = getFinalModels(formData)
  if (models.length === 0) {
    throw new Error(t("messages:axonhub.modelsMissing"))
  }

  return {
    type:
      typeof formData.type === "string"
        ? formData.type
        : DEFAULT_AXON_HUB_CHANNEL_FIELDS.type,
    name: formData.name.trim(),
    baseURL: formData.base_url.trim(),
    credentials: {
      apiKeys: [formData.key.trim()].filter(Boolean),
    },
    supportedModels: models,
    manualModels: models,
    defaultTestModel: models[0],
    settings: {},
    orderingWeight: formData.weight,
  }
}

/**
 * Search AxonHub channels using the current saved admin credentials.
 */
export async function searchChannel(
  config: AxonHubConfig,
  keyword: string,
): Promise<ManagedSiteChannelListData | null> {
  try {
    return await axonHubApi.searchChannels(config, keyword)
  } catch (error) {
    logger.error("Failed to search AxonHub channels", error)
    return null
  }
}

/**
 * List AxonHub channels using the supplied admin credentials.
 */
export async function listChannels(
  config: AxonHubConfig,
  options?: ManagedSiteChannelRequestOptions,
): Promise<ManagedSiteChannelListData> {
  try {
    return await axonHubApi.listChannels(config, options)
  } catch (error) {
    logger.error("Failed to list AxonHub channels", error)
    throw error
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

/**
 * Build a managed-site create payload from AxonHub form data.
 */
export function buildChannelPayload(
  formData: ChannelFormData,
  mode: ChannelMode = "single",
): CreateChannelPayload {
  const input = buildAxonHubInputFromFormData(formData)
  return {
    mode,
    channel: {
      name: input.name,
      type: input.type,
      key: input.credentials.apiKeys?.[0] ?? "",
      base_url: input.baseURL ?? "",
      models: input.supportedModels.join(","),
      groups: [],
      priority: 0,
      weight: input.orderingWeight ?? 0,
      status: formData.status,
    },
  }
}
